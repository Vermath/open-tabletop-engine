import { expect, test, type Page } from "@playwright/test";

test("GM requests a party check and receives the player's result after a reload", async ({ page: gm, browser, baseURL }) => {
  test.setTimeout(90_000);
  const playerContext = await browser.newContext({ baseURL });
  const player = await playerContext.newPage();
  const login = async (page: Page, seat: string) => {
    const email = seat === "gm" ? "gm@example.test" : "player@example.test";
    const response = await page.request.post(`http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}/api/v1/auth/login`, { data: { email } });
    expect(response.ok(), await response.text()).toBe(true);
    await page.addInitScript((id: string) => {
      localStorage.setItem("otte:userId", id);
      localStorage.setItem("otte:sessionTransport", "cookie");
    }, (await response.json()).user.id);
    await page.goto("/");
    await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
  };
  try {
    await Promise.all([login(gm, "gm"), login(player, "player")]);
    await gm.getByRole("button", { name: /^Party rolls/ }).click();
    const dialog = gm.getByRole("dialog", { name: "Party rolls" });
    await dialog.getByLabel("Skill check or save").selectOption("skill-perception");
    await dialog.getByRole("checkbox", { name: "Valen Ash", exact: true }).check();
    await dialog.getByRole("button", { name: "Request roll", exact: true }).click();
    const roster = dialog.getByRole("region", { name: "Perception Check", exact: true }).first();
    await expect(roster).toContainText("Pending");
    const prompt = player.getByRole("button", { name: "Roll Perception Check · Valen Ash", exact: true });
    await expect(prompt).toBeVisible();
    await player.reload();
    await expect(prompt).toBeVisible();
    await prompt.click();
    await expect(roster).toContainText(/1d20.* = -?\d+/);
    await expect(prompt).toHaveCount(0);
    await gm.reload();
    await gm.getByRole("button", { name: /^Party rolls/ }).click();
    await expect(roster).toContainText(/1d20.* = -?\d+/);
  } finally {
    await playerContext.close();
  }
});
