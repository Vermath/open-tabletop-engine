import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function loginAsDemoGm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
}

async function openServerAdmin(page: Page) {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: "Server Admin" }).click();
}

test("a deferred workspace reports loading, survives one chunk failure, and reloads the authenticated campaign", async ({ page }) => {
  await loginAsDemoGm(page);

  let releaseChunk!: () => void;
  const chunkReleased = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const chunkPattern = /\/src\/admin-panel\.tsx(?:\?|$)/;
  const failOnce = async (route: Route) => {
    await chunkReleased;
    await route.abort("failed");
  };
  await page.route(chunkPattern, failOnce);

  await openServerAdmin(page);
  await expect(page.getByRole("status").filter({ hasText: "Loading server administration" })).toBeVisible();
  releaseChunk();
  const failure = page.getByRole("alert").filter({ hasText: "server administration" });
  await expect(failure).toContainText("could not be loaded");

  await page.unroute(chunkPattern, failOnce);
  await failure.getByRole("button", { name: "Reload workspace" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openServerAdmin(page);
  await expect(page.locator(".admin-panel")).toBeVisible();
  await expect(page.getByText("Demo GM", { exact: true }).first()).toBeVisible();
});
