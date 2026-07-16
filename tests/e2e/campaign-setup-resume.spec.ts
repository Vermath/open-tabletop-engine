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
  await page.getByRole("button", { name: "Demo Player" }).click();
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

  await expect(page.getByRole("heading", { name: "T12 Resumable Campaign", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "T12 Resumable Campaign created with Twelve Bells Opening; opened session prep" })).toBeVisible();
  panel = await openManageCategory(page, "Campaign");
  await expect(panel.getByRole("heading", { name: /Next:/ }).first()).toBeVisible();
  await panel.getByRole("button", { name: /Start play/ }).click();
  await expect(page.getByRole("button", { name: "Live Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("T12 Resumable Campaign")))).toBe(false);
});
