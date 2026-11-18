import { expect, test } from "@playwright/test";

test("Explore demo opens the illustrated vault and gives its monsters playable sheets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  const board = page.getByRole("group", { name: "Vault Entry interactive battle map", exact: true });
  await expect(board.locator(".scene-map")).toBeVisible();
  await expect(board.locator(".token-image")).toHaveCount(5);
  await expect.poll(() => board.locator(".scene-map, .token-image").evaluateAll((images: HTMLImageElement[]) =>
    images.filter((image) => image.complete && image.naturalWidth > 0).length
  )).toBe(6);

  await board.getByRole("button", { name: /token Cinder Sentry$/ }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector", exact: true });
  await expect(inspector.getByRole("heading", { name: "Cinder Sentry", exact: true })).toBeVisible();
  await expect(inspector.getByText("AC 18", { exact: true })).toBeVisible();
  await inspector.getByRole("button", { name: "Sheet", exact: true }).click();
  await expect(page.getByText(/Slam/, { exact: false }).first()).toBeVisible();
});
