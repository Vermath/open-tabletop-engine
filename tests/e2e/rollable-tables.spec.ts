import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";
import { selectInspectorPanel } from "./inspector-navigation.js";

const api = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}/api/v1`;

async function signIn(page: Page, account: "gm" | "player") {
  await page.goto("/");
  const response = await page.request.post(api + "/auth/login", { data: { email: account + "@example.test" } });
  expect(response.ok()).toBe(true);
  const { user } = await response.json();
  await page.evaluate((id) => {
    localStorage.setItem("otte:userId", id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, user.id);
  await page.reload();
  await selectInspectorPanel(page, "Chat");
}

test("GM authors weighted results, controls chat visibility and invalidates a player's saved table slot", async ({ page, browser, baseURL }) => {
  test.setTimeout(100_000);
  const name = "Harbor rumors " + randomUUID().slice(0, 6);
  const playerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const player = await playerContext.newPage();
  try {
    await signIn(page, "gm");
    await signIn(player, "player");
    const panel = page.locator("details.rollable-tables");
    await panel.locator("summary").click();
    await panel.getByRole("button", { name: "New table" }).click();
    await panel.getByLabel("Table name").fill(name);
    await panel.getByLabel("Category").selectOption("rumor");
    await panel.getByLabel("Result 1", { exact: true }).fill("A ship vanished");
    await panel.getByLabel("Weight 1").fill("4");
    await panel.getByRole("button", { name: "Add result" }).click();
    await panel.getByLabel("Result 2", { exact: true }).fill("A bell rang");
    await panel.getByRole("button", { name: "Save table" }).click();
    const select = panel.getByRole("combobox", { name: "Campaign table" });
    await select.selectOption({ label: name + " · rumor" });
    const tableId = await select.inputValue();
    const snapshotUrl = /\/campaigns\/camp_demo\/snapshot(?:\?|$)/;
    await page.route(snapshotUrl, (route) => route.abort());
    const privateDraw = panel.getByRole("button", { name: "Draw GM only" });
    await privateDraw.click();
    await expect(privateDraw).toBeEnabled();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await page.unroute(snapshotUrl);
    const result = page.getByLabel("Chat messages").getByText(new RegExp(name));
    await expect(result).toHaveCount(1);
    await expect(player.locator("details.rollable-tables option", { hasText: name })).toHaveCount(0);
    await expect(player.getByLabel("Chat messages").getByText(new RegExp(name))).toHaveCount(0);

    await panel.getByRole("button", { name: "Edit table" }).click();
    await panel.getByLabel("Table visibility").selectOption("public");
    await panel.getByRole("button", { name: "Save table" }).click();
    await expect(player.locator("details.rollable-tables")).toBeVisible();
    const bar = player.getByRole("group", { name: "Personal action hotbar" });
    await bar.getByRole("button", { name: "Slot 1: Assign" }).click();
    const editor = player.getByRole("dialog", { name: "Edit hotbar" });
    await editor.getByRole("combobox", { name: "Shortcut type" }).selectOption("table");
    await editor.getByRole("combobox", { name: "Rollable table" }).selectOption(tableId);
    await editor.getByRole("button", { name: "Pin to slot 1" }).click();
    await player.reload();
    await selectInspectorPanel(player, "Chat");
    const slot = bar.getByRole("button", { name: "Slot 1: " + name + " (Public)" });
    await expect(slot).toBeEnabled();
    await player.keyboard.press("1");
    await expect(player.getByLabel("Chat messages").getByText(new RegExp(name))).toHaveCount(1);
    await expect(result).toHaveCount(2);
    await panel.getByRole("button", { name: "Edit table" }).click();
    // Commit another GM's update immediately before the reviewed action reaches
    // the API. Both edit and delete must recover from the real stale-write response.
    const changeBefore = async (route: Route, nextName: string) => {
      const headers = { "x-user-id": "usr_demo_gm", "idempotency-key": randomUUID() };
      const response = await page.request.get(api + "/campaigns/camp_demo/rollable-tables", { headers });
      const latest = (await response.json()).find((item: { id: string }) => item.id === tableId);
      const edited = await page.request.patch(route.request().url().split("?")[0]!, { headers, data: { name: nextName, expectedUpdatedAt: latest.updatedAt } });
      expect(edited.ok(), await edited.text()).toBe(true);
      await route.continue();
    };
    const resourceUrl = "**/rollable-tables/" + tableId + "*";
    await page.route(resourceUrl, (route) => changeBefore(route, name + " concurrent edit"), { times: 1 });
    await panel.getByLabel("Table name").fill(name + " draft");
    await panel.getByRole("button", { name: "Save table" }).click();
    await expect(panel.getByRole("button", { name: "Save table" })).toBeDisabled();
    await expect(panel.getByLabel("Table name")).toHaveValue(name + " draft");
    await panel.getByRole("button", { name: "Load latest table" }).click();
    await expect(panel.getByLabel("Table name")).toHaveValue(name + " concurrent edit");
    await panel.getByLabel("Table name").fill(name + " updated");
    await panel.getByRole("button", { name: "Save table" }).click();
    await expect(bar.getByRole("button", { name: "Slot 1: " + name + " updated (Public)" })).toBeEnabled();
    await panel.getByRole("button", { name: "Delete table" }).click();
    await page.route(resourceUrl, (route) => changeBefore(route, name + " concurrent delete"), { times: 1 });
    await panel.getByRole("button", { name: "Confirm delete" }).click();
    await expect(panel.getByRole("button", { name: "Confirm delete" })).toBeDisabled();
    await panel.getByRole("button", { name: "Review latest deletion" }).click();
    await expect(panel.getByText("Delete " + name + " concurrent delete? Previous draws stay in chat.")).toBeVisible();
    await panel.getByRole("button", { name: "Confirm delete" }).click();
    await expect(bar.getByRole("button", { name: "Slot 1: Unavailable" })).toBeDisabled();
    await expect(result).toHaveCount(2);
  } finally {
    await playerContext.close();
  }
});
