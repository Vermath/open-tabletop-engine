import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

async function openInspectorPanel(page: Page, panelName: string) {
  await page.locator(".inspector-tabs").getByRole("button", { name: panelName, exact: true }).click();
}

async function loginDemoGm(page: Page) {
  await page.goto("/");
  await page.evaluate(async (apiBaseUrl) => {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "gm@example.test" })
    });
    if (!response.ok) throw new Error(await response.text());
    const login = (await response.json()) as { token: string; user: { id: string } };
    localStorage.setItem("otte:userId", login.user.id);
    localStorage.setItem("otte:sessionToken", login.token);
    localStorage.setItem("otte:sessionTokenUser", login.user.id);
  }, apiBaseUrl);
  await page.goto("/");
}

test("demo GM can turn 3D dice off for text-only rolling", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
  });
  await loginDemoGm(page);
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openInspectorPanel(page, "Chat");
  const textOnlyToggle = page.getByRole("button", { name: "Use text-only dice" });
  await expect(textOnlyToggle).toHaveAttribute("aria-pressed", "true");
  await textOnlyToggle.click();

  const enable3dToggle = page.getByRole("button", { name: "Enable 3D dice" });
  await expect(enable3dToggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("otte:dice3d"))).toBe("off");

  await page.getByRole("textbox", { name: "Dice formula" }).fill("1d4");
  await page.getByRole("button", { name: "Roll dice" }).click();
  await expect(page.locator(".rail > .status")).toContainText(/Rolled \d+/);
  await expect(page.locator(".dice-cast-overlay")).toHaveCount(0);
});

test("3D dice preloads the physics stage when enabled", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
  });
  await loginDemoGm(page);
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openInspectorPanel(page, "Chat");
  await expect(page.getByRole("button", { name: "Use text-only dice" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("#dice-box-stage canvas").count(), { timeout: 6_000 }).toBeGreaterThan(0);
});

test("3D dice hides the roll result until the cast settles", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
  });
  await loginDemoGm(page);
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openInspectorPanel(page, "Chat");
  await expect(page.getByRole("button", { name: "Use text-only dice" })).toHaveAttribute("aria-pressed", "true");

  const initialRollCards = await page.locator(".chat-roll-card").count();
  await page.getByRole("textbox", { name: "Dice formula" }).fill("1d4");
  await page.getByRole("button", { name: "Roll dice" }).click();

  const rollCard = page.locator(".chat-roll-card").nth(initialRollCards);
  await expect(rollCard).toBeVisible();
  await expect(rollCard.locator(".chat-roll-total")).toHaveText("...");
  await expect(rollCard.locator(".chat-roll-dice")).toHaveCount(0);
  await expect(page.locator(".rail > .status")).toContainText("Rolling dice");

  await expect(rollCard.locator(".chat-roll-total")).toHaveText(/[1-4]/, { timeout: 4_000 });
  await expect(rollCard.locator(".chat-roll-dice")).toHaveCount(1);
  await expect(page.locator(".rail > .status")).toContainText(/Rolled [1-4]/);
});
