import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openDetails(details: Locator) {
  const summary = details.locator(":scope > summary");
  await expect(summary).toBeVisible();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await summary.click();
}

async function openManageCategory(page: Page, categoryName: string) {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: categoryName }).click();
  return panel;
}

async function openCampaignDraft(page: Page) {
  const panel = await openManageCategory(page, "Campaign");
  await openDetails(panel.locator("details.create-drawer").filter({ hasText: "New campaign" }).first());
  return panel;
}

test("campaign setup survives reload and sign-out without crossing users", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();

  let panel = await openCampaignDraft(page);
  await panel.getByRole("textbox", { name: "Campaign name", exact: true }).fill("T12 Resumable Campaign");
  await panel.getByRole("textbox", { name: "Campaign description", exact: true }).fill("Safe partial setup input");
  await panel.getByRole("button", { name: "Next: Scene & map" }).click();
  await panel.getByRole("checkbox", { name: "Include starter content" }).uncheck();
  await panel.getByRole("textbox", { name: "Setup initial scene name" }).fill("Twelve Bells Opening");
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("T12 Resumable Campaign")))).toBe(true);

  await page.reload();
  panel = await openCampaignDraft(page);
  await expect(panel.getByRole("heading", { name: "Prepare the first scene" })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Setup initial scene name" })).toHaveValue("Twelve Bells Opening");
  await expect(panel.getByText("Resumed the setup draft saved in this browser.")).toBeVisible();

  await panel.locator(".manage-category-button", { hasText: "Account" }).click();
  await panel.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Demo GM" }).click();
  await page.getByRole("combobox", { name: "Session user" }).selectOption("usr_demo_player");
  await expect(page.getByRole("combobox", { name: "Session user" })).toHaveValue("usr_demo_player");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel.getByRole("heading", { name: /Next: Your character|Next: Join the table/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Your character/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Invite players/ })).toHaveCount(0);
  await expect(panel.getByText("Resumed the setup draft saved in this browser.")).toHaveCount(0);

  await panel.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Demo GM" }).click();
  panel = await openCampaignDraft(page);
  await expect(panel.getByRole("textbox", { name: "Setup initial scene name" })).toHaveValue("Twelve Bells Opening");
  await panel.getByRole("button", { name: "Next: Invitation" }).click();
  await panel.getByRole("button", { name: "Skip for now" }).click();
  await expect(panel.getByRole("heading", { name: "Review and create" })).toBeVisible();
  await panel.getByRole("button", { name: "Create Campaign Setup" }).click();

  await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("T12 Resumable Campaign");
  await expect(page.getByRole("status").filter({ hasText: "T12 Resumable Campaign created with Twelve Bells Opening; opened session prep" })).toBeVisible();
  panel = await openManageCategory(page, "Campaign");
  await expect(panel.getByRole("heading", { name: /Next:/ }).first()).toBeVisible();
  await panel.getByRole("button", { name: /Start play/ }).click();
  await expect(page.getByRole("button", { name: "Live Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("T12 Resumable Campaign")))).toBe(false);
});

test("a new GM can replay a lost Ember Vault creation response and open the playable board", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Account mode" }).getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Register email").fill(`ember-${Date.now()}@example.test`);
  await page.getByLabel("Register display name").fill("Starter GM");
  await page.getByLabel("Register password").fill("ember-starter-test");
  await page.locator("form").getByRole("button", { name: "Register" }).click();

  const panel = await openCampaignDraft(page);
  await panel.getByLabel("Campaign name", { exact: true }).fill("My Ember Vault");
  await expect(panel.getByLabel("Starting adventure")).toHaveValue("blank");
  await panel.getByLabel("Starting adventure").selectOption("ember-vault");
  await panel.getByRole("button", { name: "Next: Scene & map" }).click();
  await expect(panel.getByText(/Vault Entry includes a calibrated map/)).toBeVisible();
  await panel.getByRole("button", { name: "Next: Invitation" }).click();
  await panel.getByRole("button", { name: "Skip for now" }).click();
  await expect(panel.getByLabel("Campaign setup impact")).toContainText("The Ember Key");

  let committedId: string | undefined;
  await page.route("**/api/v1/campaigns", async (route) => {
    if (route.request().method() !== "POST" || committedId) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committedId = (await response.json()).id;
    await route.abort("connectionreset");
  });
  const submit = panel.getByRole("button", { name: "Create Campaign Setup" });
  await submit.click();
  await expect.poll(() => committedId).toBeTruthy();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("My Ember Vault");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("otte:selectedCampaignId"))).toBe(committedId);
  await expect(page.getByRole("button", { name: "Live Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  const board = page.getByRole("group", { name: "Vault Entry interactive battle map", exact: true });
  await expect(board.locator(".token-image")).toHaveCount(5);
  await expect.poll(() => board.locator(".scene-map, .token-image").evaluateAll((images: HTMLImageElement[]) =>
    images.filter((image) => image.complete && image.naturalWidth > 0).length
  )).toBe(6);

  await page.getByRole("button", { name: "Open command palette" }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByLabel("Command palette search").fill("Open Encounter Builder");
  await palette.getByRole("option", { name: /Open Encounter Builder/ }).click();
  const builder = page.getByRole("dialog", { name: "Encounter builder" });
  await builder.getByRole("button", { name: /The Vault Watch/ }).click();
  await builder.getByRole("button", { name: "Place & review combat" }).click();
  const review = page.getByRole("dialog", { name: /^Review Vault Entry/ });
  await review.getByRole("spinbutton", { name: "Valen Ash initiative" }).fill("15");
  await review.getByRole("spinbutton", { name: "Mira Vale initiative" }).fill("18");
  await review.getByRole("checkbox", { name: /Server-roll initiative/ }).check();
  await review.getByRole("button", { name: "Start combat (5)" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Combat started with 5 confirmed combatants" })).toBeVisible();
  for (const name of ["Valen Ash", "Mira Vale", "Cinder Sentry", "Ember Scout", "Ash Elemental"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}, initiative`) })).toBeVisible();
  }
  await expect(board.locator(".token-image")).toHaveCount(5);
});
