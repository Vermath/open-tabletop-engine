import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Campaign, Scene, Token } from "../../packages/core/src/types.js";

/**
 * The board draws its map image and light glows on a canvas that covers only
 * the visible area. These tests pin what that must not change: the picture,
 * the DOM elements other code reads, token interaction, and the opt-out.
 */
const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";
const mapFixture = resolve("tests/e2e/fixtures/offset-grid.png");
const canvasMargin = 256;
const gmHeaders = { authorization: "Bearer otte-cookie-session", origin: webBaseUrl };

async function api<T>(page: Page, method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method, data,
    headers: { ...gmHeaders, ...(method === "GET" ? {} : { "idempotency-key": `board-canvas:${crypto.randomUUID()}` }) },
  });
  const body = await response.text();
  expect(response.ok(), `${method} ${path}: ${body}`).toBe(true);
  return JSON.parse(body) as T;
}

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
}

/** A scene of its own with a map image, a light, a darkness source and one token, so other specs' scenes are untouched. */
async function createMapScene(page: Page): Promise<{ scene: Scene; token: Token }> {
  const campaign = await api<Campaign>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  const created = await api<Scene>(page, "POST", `/api/v1/campaigns/${campaignId}/scenes`, {
    name: `Canvas renderer ${Date.now().toString(36)}`, width: 1020, height: 760, gridType: "square", gridSize: 50, expectedUpdatedAt: campaign.updatedAt,
  });
  const upload = await page.request.post(
    `${apiBaseUrl}/api/v1/campaigns/${campaignId}/assets/upload?sceneId=${created.id}&setAsBackground=true&expectedSceneUpdatedAt=${encodeURIComponent(created.updatedAt)}`,
    { headers: { ...gmHeaders, "idempotency-key": `board-canvas-map:${crypto.randomUUID()}`, "content-type": "image/png", "x-asset-name": encodeURIComponent("canvas-renderer-map.png") }, data: readFileSync(mapFixture) },
  );
  expect(upload.ok(), await upload.text()).toBe(true);
  const revision = async () => (await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`)).updatedAt;
  await api(page, "POST", `/api/v1/scenes/${created.id}/lights`, { x: 300, y: 300, radius: 220, color: "#7ad1ff", intensity: 0.5, expectedUpdatedAt: await revision() });
  await api(page, "POST", `/api/v1/scenes/${created.id}/lights`, { x: 760, y: 420, radius: 180, color: "#101018", intensity: 0.7, kind: "darkness", expectedUpdatedAt: await revision() });
  const token = await api<Token>(page, "POST", `/api/v1/scenes/${created.id}/tokens`, { name: "Canvas scout", x: 500, y: 350, ownerUserIds: ["usr_demo_gm"], expectedUpdatedAt: await revision() });
  const scene = await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`);
  expect(scene.backgroundAssetId).toBeTruthy();
  expect(scene).toMatchObject({ width: 1020, height: 760 });
  expect(scene.lights).toHaveLength(2);
  return { scene, token };
}

async function openScene(page: Page, scene: Scene): Promise<Locator> {
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  const tab = page.locator(".scene-tab").filter({ hasText: scene.name });
  await expect(tab).toBeVisible();
  await tab.click();
  const showScene = page.getByRole("button", { name: "Show scene", exact: true });
  if (await showScene.isVisible()) await showScene.click();
  const board = page.getByRole("group", { name: `${scene.name} interactive battle map`, exact: true });
  await expect(board).toBeVisible();
  await expect.poll(() => board.locator(".scene-map").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1020);
  return board;
}

/** Canvas placement against the visible part of the board, all in board-local CSS pixels. */
function canvasState(board: Locator) {
  return board.evaluate((element) => {
    const canvas = element.querySelector<HTMLCanvasElement>(".board-map-canvas");
    const viewport = element.closest(".scene-viewport")!.getBoundingClientRect();
    // The board's children are laid out inside its border.
    const outer = element.getBoundingClientRect();
    const bounds = { left: outer.left + element.clientLeft, top: outer.top + element.clientTop, width: outer.width - 2 * element.clientLeft, height: outer.height - 2 * element.clientTop };
    const visible = {
      left: Math.max(0, viewport.left - bounds.left), top: Math.max(0, viewport.top - bounds.top),
      right: Math.min(bounds.width, viewport.right - bounds.left), bottom: Math.min(bounds.height, viewport.bottom - bounds.top),
    };
    if (!canvas) return null;
    const left = parseFloat(canvas.style.left), top = parseFloat(canvas.style.top), width = parseFloat(canvas.style.width), height = parseFloat(canvas.style.height);
    return {
      left, top, width, height, right: left + width, bottom: top + height,
      backingWidth: canvas.width, backingHeight: canvas.height,
      draws: Number(canvas.dataset.drawCount ?? 0),
      visible, board: { width: bounds.width, height: bounds.height }, viewport: { width: viewport.width, height: viewport.height },
      ratio: window.devicePixelRatio,
    };
  });
}

async function expectCanvasCoversView(board: Locator) {
  await expect.poll(async () => {
    const state = (await canvasState(board))!;
    return state.left <= state.visible.left + 0.5 && state.top <= state.visible.top + 0.5 && state.right >= state.visible.right - 0.5 && state.bottom >= state.visible.bottom - 0.5;
  }, { message: "the canvas should cover the visible part of the board" }).toBe(true);
}

/** The same settled state for either renderer: vision loaded, the token selected, the pointer out of the way. */
async function settledScreenshot(page: Page, board: Locator): Promise<Buffer> {
  await board.locator("button.token").click();
  await expect(board.locator("button.token.selected")).toHaveCount(1);
  await expect(board.locator(".lighting-layer")).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  return page.locator(".scene-viewport").screenshot();
}

/** Mean absolute difference per colour channel between two screenshots of the same size. */
async function meanPixelDifference(page: Page, first: Buffer, second: Buffer): Promise<number> {
  return page.evaluate(async ([a, b]) => {
    const pixels = async (base64: string) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    };
    const [left, right] = await Promise.all([pixels(a!), pixels(b!)]);
    if (left.length !== right.length) return Number.POSITIVE_INFINITY;
    let total = 0;
    for (let index = 0; index < left.length; index += 4) total += Math.abs(left[index]! - right[index]!) + Math.abs(left[index + 1]! - right[index + 1]!) + Math.abs(left[index + 2]! - right[index + 2]!);
    return total / (left.length / 4) / 3;
  }, [first.toString("base64"), second.toString("base64")]);
}

test("the canvas renderer draws the same board as the DOM renderer and keeps the elements other code reads", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const { scene } = await createMapScene(page);
  let board = await openScene(page, scene);

  await expect(board).toHaveAttribute("data-map-renderer", "canvas");
  await expect(board.locator("canvas.board-map-canvas")).toHaveCount(1);
  await expect(board.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => (await canvasState(board))!.draws).toBeGreaterThan(0);
  // The map image and the light elements stay in the document; the canvas replaces only their pixels.
  await expect(board.locator("img.scene-map")).toBeVisible();
  await expect(board.locator(".light-source")).toHaveCount(2);
  await expect(board.locator(".light-source.darkness")).toHaveCount(1);
  await expect(board.locator(".light-source").first()).toBeHidden();
  await expect(board.locator("button.token")).toHaveCount(1);
  expect(await board.locator("canvas.board-map-canvas").evaluate((canvas) => getComputedStyle(canvas).pointerEvents)).toBe("none");

  // The AI board capture snapshots the DOM: for its duration the original elements show and the canvas is left out.
  const duringCapture = await board.evaluate((element) => {
    const board = element as HTMLElement;
    board.dataset.boardCapture = "true";
    const styles = {
      mapClip: getComputedStyle(board.querySelector(".scene-map")!).clipPath,
      lightDisplay: getComputedStyle(board.querySelector(".light-source")!).display,
      canvasDisplay: getComputedStyle(board.querySelector(".board-map-canvas")!).display,
    };
    delete board.dataset.boardCapture;
    return styles;
  });
  expect(duringCapture).toEqual({ mapClip: "none", lightDisplay: "block", canvasDisplay: "none" });

  // Both screenshots follow the same steps: reopen the scene, select the token, wait for vision.
  board = await openScene(page, scene);
  const canvasShot = await settledScreenshot(page, board);

  // Same scene, same view, original DOM renderer.
  await page.evaluate(() => window.localStorage.setItem("otte:boardRenderer", "dom"));
  board = await openScene(page, scene);
  await expect(board).toHaveAttribute("data-map-renderer", "dom");
  await expect(board.locator("canvas")).toHaveCount(0);
  await expect(board.locator(".light-source").first()).toBeVisible();
  const mapStyle = await board.locator("img.scene-map").evaluate((image) => ({ opacity: getComputedStyle(image).opacity, clipPath: getComputedStyle(image).clipPath }));
  expect(mapStyle).toEqual({ opacity: "0.88", clipPath: "none" });
  const domShot = await settledScreenshot(page, board);

  // Blank boards would also match each other, so first check that the map is really in the picture.
  await board.evaluate((element) => { (element.querySelector(".scene-map") as HTMLElement).style.visibility = "hidden"; });
  const withoutMap = await page.locator(".scene-viewport").screenshot();
  await board.evaluate((element) => { (element.querySelector(".scene-map") as HTMLElement).style.visibility = ""; });
  expect(await meanPixelDifference(page, domShot, withoutMap), "the map should make a visible difference").toBeGreaterThan(8);
  // Not pixel-identical: the canvas glows sit under the grid overlay's tint rather than over it, and image scaling
  // rounds differently. Measured at about 1 level in 255; a misplaced or mis-scaled map measures 4 or more.
  expect(await meanPixelDifference(page, canvasShot, domShot), "canvas and DOM renderers should draw the same board").toBeLessThan(1.6);
  await page.evaluate(() => window.localStorage.removeItem("otte:boardRenderer"));
});

test("the canvas stays the size of the view while zooming and panning, and token moves do not redraw it", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const { scene, token } = await createMapScene(page);
  const board = await openScene(page, scene);
  await expect(board).toHaveAttribute("data-map-renderer", "canvas");
  await expectCanvasCoversView(board);

  // Zoom far in: the board grows well past the view, the canvas does not.
  const zoomIn = page.getByRole("button", { name: "Zoom battle map in", exact: true });
  for (let step = 0; step < 8 && await zoomIn.isEnabled(); step += 1) await zoomIn.click();
  await expectCanvasCoversView(board);
  await expect.poll(async () => {
    const state = (await canvasState(board))!;
    // Once the zoom settles the canvas is redrawn at its displayed size.
    return Math.abs(state.backingWidth - Math.round(state.width * state.ratio)) <= 1 && Math.abs(state.backingHeight - Math.round(state.height * state.ratio)) <= 1;
  }, { message: "the canvas should be redrawn at the new zoom" }).toBe(true);
  const zoomed = (await canvasState(board))!;
  expect(zoomed.board.width).toBeGreaterThan(zoomed.viewport.width * 1.5);
  expect(zoomed.width).toBeLessThanOrEqual(zoomed.viewport.width + 2 * canvasMargin + 2);
  expect(zoomed.height).toBeLessThanOrEqual(zoomed.viewport.height + 2 * canvasMargin + 2);
  expect(zoomed.width).toBeLessThan(zoomed.board.width);

  // Pan to the far corner: the canvas moves with the view.
  await page.locator(".scene-viewport").evaluate((element) => element.scrollTo({ left: element.scrollWidth, top: element.scrollHeight, behavior: "instant" }));
  await expectCanvasCoversView(board);
  const panned = (await canvasState(board))!;
  expect(panned.draws).toBeGreaterThan(zoomed.draws);
  expect(panned.left).toBeGreaterThan(zoomed.left);
  expect(panned.right).toBeLessThanOrEqual(panned.board.width + 1);
  expect(panned.bottom).toBeLessThanOrEqual(panned.board.height + 1);

  // Moving a token changes the scene but not the map or its lights, so the canvas is left alone.
  const piece = board.getByRole("button", { name: /token Canvas scout$/ });
  await piece.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  await expectCanvasCoversView(board);
  await page.waitForTimeout(400);
  const before = (await canvasState(board))!;
  await piece.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await api<{ tokens: Token[] }>(page, "GET", `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${scene.id}`)).tokens.find((entry) => entry.id === token.id)?.x).toBeGreaterThan(token.x);
  await page.waitForTimeout(400);
  const after = (await canvasState(board))!;
  expect(after.draws).toBe(before.draws);
});
