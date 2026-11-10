import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openValenActions(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await expect(page.locator(".scene-board")).toBeVisible();
  await page.locator("#inspector-tab-actors").click();
  // Exact name: an earlier test in a full run leaves a "Valen Ash Copy" beside the seeded character.
  await page.getByRole("region", { name: "Party" }).getByRole("button", { name: "VA Valen Ash Fighter", exact: true }).click();
  await expect(page.locator(".inspector").getByRole("heading", { name: "Valen Ash" })).toBeVisible();
  await page.getByRole("tab", { name: "Actions" }).click();
  const sheet = page.getByRole("region", { name: "Actor action sheet" });
  await expect(sheet).toBeVisible();
  // Target and effect options live in the collapsed actor details.
  const details = page.locator(".inspector details.actor-detail-disclosure").filter({ hasText: "Actor details" }).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator(":scope > summary").click();
  return sheet;
}

/** Targets the seeded Valen Ash by option value, whatever label a duplicate name gives it. */
async function targetValen(page: Page) {
  const target = page.getByRole("combobox", { name: "Action target actor" });
  const value = await target.evaluate((select) => {
    const options = Array.from((select as HTMLSelectElement).options);
    return (options.find((option) => option.value === "act_valen") ?? options.find((option) => option.text.startsWith("Valen Ash") && !option.text.includes("Copy")))?.value ?? null;
  });
  expect(value).not.toBeNull();
  await target.selectOption(value!);
}

/** Second Wind uses left, read from the resource line ("Second Wind 2/2"). */
async function secondWindUses(resources: Locator): Promise<number> {
  const match = /Second Wind (\d+)\/\d+/.exec(await resources.innerText());
  expect(match).not.toBeNull();
  return Number(match![1]);
}

function statusLine(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

test("a routine action commits in one step and can be undone from its toast", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  const usesBefore = await secondWindUses(resources);
  test.skip(usesBefore < 1, "An earlier test in this run spent every Second Wind use.");
  const hpBefore = await inspector.locator(".hp-bar").first().innerText();

  await targetValen(page);
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("status", { name: "Action review progress" })).toContainText("Preview ready - nothing committed");

  await secondWind.getByRole("button", { name: /^Use .* now$/ }).click();

  // No review dialog: the result is committed and reported with an undo.
  const toast = page.locator(".toast").filter({ hasText: `Valen Ash used action: Second Wind ${usesBefore - 1}; healing applied` });
  await expect(toast).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Review / })).toHaveCount(0);
  await expect.poll(() => secondWindUses(resources)).toBe(usesBefore - 1);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(statusLine(page, "Last D&D rules change undone")).toBeVisible();
  await expect.poll(() => secondWindUses(resources)).toBe(usesBefore);
  await expect.poll(async () => inspector.locator(".hp-bar").first().innerText()).toBe(hpBefore);
});

test("the review is still one click away and cancelling it commits nothing", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  const usesBefore = await secondWindUses(resources);
  test.skip(usesBefore < 1, "An earlier test in this run spent every Second Wind use.");

  await targetValen(page);
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
  expect(await secondWindUses(resources)).toBe(usesBefore);
});
