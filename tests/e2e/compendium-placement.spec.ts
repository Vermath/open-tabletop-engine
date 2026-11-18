import { expect, test } from "@playwright/test";
import type { CompendiumMonsterPlacement } from "../../packages/core/src/types.js";
import { selectInspectorPanel } from "./inspector-navigation.js";

test("place a compendium monster by keyboard and drag, retry a lost response, and undo just that drop", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const inspector = page.getByRole("button", { name: "Show inspector", exact: true });
  if (await inspector.isVisible()) await inspector.click();
  await selectInspectorPanel(page, "Compendium");
  const catalog = page.locator("section.standalone-compendium");
  await catalog.getByRole("combobox", { name: "System", exact: true }).selectOption("dnd-5e-srd");
  await catalog.getByRole("searchbox", { name: "Search" }).fill("Aboleth");
  const button = catalog.getByRole("button", { name: "Place Aboleth on map" });
  await expect(button).toBeEnabled();

  const matcher = /\/compendium-monster-placements$/;
  const keyboardResponse = page.waitForResponse((r) => matcher.test(r.url()) && r.request().method() === "POST");
  await button.focus();
  await page.keyboard.press("Enter");
  const firstResponse = await keyboardResponse;
  expect(firstResponse.ok(), await firstResponse.text()).toBe(true);
  const first = await firstResponse.json() as CompendiumMonsterPlacement;
  const base = new URL(firstResponse.url()).origin + "/api/v1";
  const sceneButton = page.getByRole("button", { name: "Show scene", exact: true });
  if (await sceneButton.isVisible()) await sceneButton.click();
  const board = page.locator(".scene-board");
  await expect(board).toBeVisible();
  await expect(button).toBeEnabled();

  let committed: CompendiumMonsterPlacement | undefined;
  await page.route(matcher, async (route) => {
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    committed = await response.json() as CompendiumMonsterPlacement;
    await route.abort("failed");
  }, { times: 1 });
  await button.dragTo(board, { targetPosition: { x: 130, y: 160 } });
  const retry = page.getByRole("alert").filter({ hasText: "Place Aboleth failed" }).getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  const replayResponse = page.waitForResponse((r) => matcher.test(r.url()) && r.request().method() === "POST");
  await retry.click();
  const replay = await replayResponse;
  expect(replay.ok(), await replay.text()).toBe(true);
  expect(replay.headers()["idempotency-replayed"]).toBe("true");
  const second = await replay.json() as CompendiumMonsterPlacement;
  expect(second.actor.id).toBe(committed?.actor.id);
  expect(second.sceneToken.actorId).toBe(second.actor.id);
  expect([second.sceneToken.x, second.sceneToken.y]).not.toEqual([first.sceneToken.x, first.sceneToken.y]);

  // The retry button disappears as soon as the request starts. Undo becomes
  // available once replay reconciliation selects the authoritative token.
  await expect(board.locator(`[data-token-id="${second.sceneToken.id}"]`)).toHaveAttribute("aria-pressed", "true");
  const undoResponse = page.waitForResponse((r) => r.url().endsWith(second.placementId + "/history") && r.request().method() === "POST");
  await page.keyboard.press("Control+z");
  const undo = await undoResponse;
  expect(undo.ok(), await undo.text()).toBe(true);
  expect(await undo.json()).toMatchObject({ direction: "undo", actorId: second.actor.id, tokenId: second.sceneToken.id });
  expect((await page.request.get(base + "/actors/" + first.actor.id)).status()).toBe(200);
  expect((await page.request.get(base + "/actors/" + second.actor.id)).status()).toBe(404);
  const sceneTokens = await page.request.get(base + "/scenes/" + first.scene.id + "/tokens");
  expect(sceneTokens.ok()).toBe(true);
  const tokenIds = (await sceneTokens.json() as Array<{ id: string }>).map((token) => token.id);
  expect(tokenIds).toContain(first.sceneToken.id);
  expect(tokenIds).not.toContain(second.sceneToken.id);
  const removeFirst = page.waitForResponse((r) => r.url().endsWith(first.placementId + "/history") && r.request().method() === "POST");
  await page.keyboard.press("Control+z");
  expect((await removeFirst).ok()).toBe(true);
});
