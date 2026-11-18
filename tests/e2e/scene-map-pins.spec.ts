import { readFileSync } from "node:fs";
import { selectInspectorPanel } from "./inspector-navigation.js";
import { expect, type Page } from "@playwright/test";
import { test } from "./active-scene-fixture.js";
import type { CampaignMember, Handout } from "../../packages/core/src/types.js";

const api = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const origin = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;

async function seat(page: Page, player = false) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  if (player) await page.getByRole("combobox", { name: "Session user", exact: true }).selectOption("usr_demo_player");
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  const show = page.getByRole("button", { name: "Show scene", exact: true });
  if (await show.isVisible()) await show.click();
}

test("drop a journal article on the board, label it, open it and remove it", async ({ page }) => {
  await seat(page);
  await page.getByRole("tab", { name: "Journal", exact: true }).click();
  const source = page.getByRole("article", { name: "Journal entry Session Hook" });
  const board = page.getByRole("group", { name: /interactive battle map/ });
  await source.dragTo(board, { targetPosition: { x: 120, y: 100 } });
  const editor = page.getByRole("dialog", { name: "Edit map pin" });
  await expect(editor.getByRole("combobox", { name: "Linked entry", exact: true })).toHaveValue(JSON.stringify(["journal", "jnl_hook"]));
  await editor.getByLabel("Pin label").fill("J4");
  await editor.getByRole("button", { name: "Save pin" }).click();
  const pin = page.getByRole("button", { name: "Open map pin J4" });
  await pin.click();
  await expect(page.getByRole("dialog")).toContainText("both braziers");
  await page.getByRole("button", { name: "Edit map pin" }).click();
  await editor.getByRole("button", { name: "Remove pin" }).click();
  await expect(pin).toHaveCount(0);
});

test("place and move a linked handout, read from the board and revoke it live", async ({ page, browser, activeTestScene }) => {
  test.setTimeout(75_000);
  await seat(page);
  await page.locator(".scene-tab").filter({ hasText: activeTestScene.name }).click();
  await expect(page.getByRole("group", { name: `${activeTestScene.name} interactive battle map` })).toBeVisible();
  const title = `Map clue ${crypto.randomUUID()}`;
  const headers = { authorization: "Bearer otte-cookie-session", origin, "idempotency-key": crypto.randomUUID() };
  const campaign = await page.request.get(`${api}/api/v1/campaigns/camp_demo`, { headers });
  const expectedUpdatedAt = (await campaign.json()).updatedAt;
  const created = await page.request.post(`${api}/api/v1/campaigns/camp_demo/handouts`, { headers, data: { expectedUpdatedAt, title, body: "The west arch opens at dusk.", visibility: "public" } });
  expect(created.ok(), await created.text()).toBe(true);
  const handout = await created.json() as Handout;
  await page.getByRole("button", { name: "Place map pin" }).click();
  const editor = page.getByRole("dialog", { name: "Edit map pin" });
  await editor.getByRole("combobox", { name: "Linked entry", exact: true }).selectOption({ label: `${title} (handout)` });
  await editor.getByLabel("Pin label").fill("A3");
  await editor.getByLabel("X coordinate").fill("350");
  await editor.getByLabel("Y coordinate").fill("250");
  await editor.getByLabel("Pin audience").selectOption("readers");
  await editor.getByRole("button", { name: "Save pin" }).click();
  const marker = page.getByRole("button", { name: "Open map pin A3" });
  await marker.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Edit map pin" }).click();
  await editor.getByLabel("X coordinate").fill("400");
  const oldPosition = await marker.getAttribute("style");
  await editor.getByRole("button", { name: "Save pin" }).click();
  await expect(marker).not.toHaveAttribute("style", oldPosition!);
  const context = await browser.newContext({ baseURL: origin });
  try {
    const other = await context.newPage();
    await seat(other, true);
    const playerMarker = other.getByRole("button", { name: "Open map pin A3" });
    await playerMarker.click();
    await expect(other.getByRole("dialog", { name: "Linked entry" })).toContainText("The west arch opens at dusk.");
    const revoke = await page.request.patch(`${api}/api/v1/handouts/${handout.id}`, { headers: { ...headers, "idempotency-key": crypto.randomUUID() }, data: { visibility: "gm_only", expectedUpdatedAt: handout.updatedAt } });
    expect(revoke.ok(), await revoke.text()).toBe(true);
    await expect(playerMarker).toHaveCount(0);
    await expect(other.getByRole("dialog")).toHaveCount(0);
    await other.reload();
    await expect(other.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
    await expect(playerMarker).toHaveCount(0);
  } finally {
    await context.close();
    const latest = await page.request.get(`${api}/api/v1/handouts/${handout.id}`, { headers });
    const removed = await page.request.delete(`${api}/api/v1/handouts/${handout.id}?expectedUpdatedAt=${encodeURIComponent((await latest.json()).updatedAt)}`, { headers: { ...headers, "idempotency-key": crypto.randomUUID() } });
    expect(removed.ok(), await removed.text()).toBe(true);
  }
});

test("presents a private illustrated handout and journal pin while the player stays on the map", async ({ page, browser, activeTestScene }) => {
  test.setTimeout(90_000);
  await seat(page);
  await page.locator(".scene-tab").filter({ hasText: activeTestScene.name }).click();
  const campaign = api + "/api/v1/campaigns/camp_demo";
  const headers = () => ({ authorization: "Bearer otte-cookie-session", origin, "idempotency-key": crypto.randomUUID() });
  const upload = await page.request.post(campaign + "/assets/upload", {
    headers: { ...headers(), "content-type": "image/png", "x-asset-name": "private-letter.png" }, data: readFileSync("tests/e2e/fixtures/offset-grid.png"),
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const { asset } = await upload.json();
  const revision = await page.request.get(campaign, { headers: headers() });
  const created = await page.request.post(campaign + "/handouts", { headers: headers(), data: {
    title: `Sealed letter ${crypto.randomUUID()}`, body: "The seal bears a silver wren.", visibility: "gm_only", assetIds: [asset.id], expectedUpdatedAt: (await revision.json()).updatedAt,
  } });
  expect(created.ok(), await created.text()).toBe(true);
  const handout = await created.json() as Handout;
  const context = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  try {
    const player = await context.newPage();
    await seat(player, true);
    const chat = await selectInspectorPanel(player, "Chat");
    const playerBoard = player.getByRole("group", { name: `${activeTestScene.name} interactive battle map` });
    await expect(playerBoard).toBeVisible();
    const beforeUrl = player.url();
    await selectInspectorPanel(page, "Handouts");
    await page.getByRole("button", { name: new RegExp(handout.title) }).click();
    await page.getByText("Show to players", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Demo Player" }).check();
    await page.getByRole("button", { name: "Show selected players" }).click();
    const modal = player.getByRole("dialog", { name: "Shared by the GM" });
    await expect(modal.getByRole("heading", { name: handout.title })).toBeVisible();
    await expect(modal).toContainText(handout.body);
    const image = modal.getByRole("img", { name: asset.name });
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const imageUrl = (await image.getAttribute("src"))!;
    await modal.getByRole("button", { name: "Dismiss" }).click();
    await expect(modal).toHaveCount(0);
    await expect(chat).toHaveAttribute("aria-selected", "true");
    await expect(playerBoard).toBeVisible();
    expect(player.url()).toBe(beforeUrl);
    await expect.poll(async () => (await player.request.get(imageUrl, { headers: headers() })).status()).toBe(404);
    await page.getByRole("button", { name: "Show selected players" }).click();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const secondUrl = (await image.getAttribute("src"))!;
    async function seatRole(role: "observer" | "player") {
      const members = await page.request.get(campaign + "/members", { headers: headers() });
      const member = (await members.json() as CampaignMember[]).find((m) => m.userId === "usr_demo_player")!;
      const changed = await page.request.patch(`${campaign}/members/${member.id}`, { headers: headers(), data: { role, expectedUpdatedAt: member.updatedAt } });
      expect(changed.ok(), await changed.text()).toBe(true);
    }
    await seatRole("observer");
    try {
      await expect(modal).toHaveCount(0);
      await expect(player.getByText(handout.title, { exact: true })).toHaveCount(0);
      await expect(player.getByText(handout.body, { exact: true })).toHaveCount(0);
      await expect(player.getByRole("img", { name: asset.name })).toHaveCount(0);
      await expect(playerBoard).toBeVisible();
    } finally {
      await seatRole("player");
    }
    expect((await player.request.get(secondUrl, { headers: headers() })).status()).toBe(404);
    const persisted = await page.request.get(`${api}/api/v1/handouts/${handout.id}`, { headers: headers() });
    expect(await persisted.json()).toMatchObject({ visibility: "gm_only", visibleToUserIds: [], visibleToActorIds: [] });

    await page.getByRole("button", { name: "Place map pin" }).click();
    const editor = page.getByRole("dialog", { name: "Edit map pin" });
    await editor.getByRole("combobox", { name: "Linked entry", exact: true }).selectOption(JSON.stringify(["journal", "jnl_hook"]));
    await editor.getByLabel("Pin label").fill("GM key");
    await editor.getByRole("button", { name: "Save pin" }).click();
    await page.getByRole("button", { name: "Open map pin GM key" }).click();
    const pinDialog = page.getByRole("dialog", { name: "Linked entry" });
    await pinDialog.getByText("Show to players", { exact: true }).click();
    await pinDialog.getByRole("checkbox", { name: "Demo Player" }).check();
    await pinDialog.getByRole("button", { name: "Show selected players" }).click();
    await expect(modal).toContainText("both braziers");
    await expect(player.getByRole("button", { name: "Open map pin GM key" })).toHaveCount(0);
    await player.reload();
    await expect(playerBoard).toBeVisible();
    await expect(modal).toHaveCount(0);
    await expect(player.getByText("both braziers", { exact: false })).toHaveCount(0);
  } finally {
    await context.close();
    const removed = await page.request.delete(`${api}/api/v1/handouts/${handout.id}?expectedUpdatedAt=${encodeURIComponent(handout.updatedAt)}`, { headers: headers() });
    expect(removed.ok(), await removed.text()).toBe(true);
  }
});
