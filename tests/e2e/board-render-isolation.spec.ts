import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Campaign, Scene, Token } from "../../packages/core/src/types.js";

/**
 * The board's tokens and static layers are memoised. These tests pin the
 * point of that: moving one token does not re-render the other tokens, the
 * walls or their handles, and zooming re-renders none of them. They read the
 * render counters the layers keep in `window.__otteBoardRenderCounts`.
 */
const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";
const gmHeaders = { authorization: "Bearer otte-cookie-session", origin: webBaseUrl };
const tokenCount = 24;
const wallCount = 30;

type RenderCounts = Record<"scene" | "token" | "lighting" | "darkness" | "difficultTerrain" | "walls" | "structureHandles" | "visionMask", number>;

async function api<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method, data,
    headers: { ...gmHeaders, ...(method === "GET" ? {} : { "idempotency-key": `board-isolation:${crypto.randomUUID()}` }) },
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

/** A scene of its own with enough tokens and walls that re-rendering all of them would be unmistakable. */
async function createBusyScene(page: Page): Promise<{ scene: Scene; tokens: Token[] }> {
  const campaign = await api<Campaign>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  const created = await api<Scene>(page, "POST", `/api/v1/campaigns/${campaignId}/scenes`, {
    name: `Render isolation ${Date.now().toString(36)}`, width: 1600, height: 1200, gridType: "square", gridSize: 50, expectedUpdatedAt: campaign.updatedAt,
  });
  const revision = async () => (await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`)).updatedAt;
  for (let index = 0; index < wallCount; index += 1) {
    const x = 100 + (index % 10) * 140;
    const y = 100 + Math.floor(index / 10) * 350;
    await api(page, "POST", `/api/v1/scenes/${created.id}/walls`, { x1: x, y1: y, x2: x + 100, y2: y, ...(index % 7 === 0 ? { kind: "door" } : {}), expectedUpdatedAt: await revision() });
  }
  await api(page, "POST", `/api/v1/scenes/${created.id}/lights`, { x: 400, y: 400, radius: 260, color: "#ffd27a", expectedUpdatedAt: await revision() });
  const tokens: Token[] = [];
  for (let index = 0; index < tokenCount; index += 1) {
    tokens.push(await api<Token>(page, "POST", `/api/v1/scenes/${created.id}/tokens`, {
      name: `Piece ${String(index + 1).padStart(2, "0")}`, x: 200 + (index % 8) * 150, y: 250 + Math.floor(index / 8) * 300, width: 50, height: 50, ownerUserIds: ["usr_demo_gm"], expectedUpdatedAt: await revision(),
    }));
  }
  const scene = await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`);
  expect(scene.walls).toHaveLength(wallCount);
  return { scene, tokens };
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
  await expect(board.locator("button.token")).toHaveCount(tokenCount);
  await expect(board.locator(".wall-layer line")).toHaveCount(wallCount);
  return board;
}

const renderCounts = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __otteBoardRenderCounts: RenderCounts }).__otteBoardRenderCounts }));

test("pasted tokens use the server revision on a browser with a fast clock", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const { scene } = await createBusyScene(page);
  const board = await openScene(page, scene);
  await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
  await board.getByRole("button", { name: /token Piece 01$/ }).click();
  await page.keyboard.press("Control+c");
  const createdResponse = page.waitForResponse((response) => response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/api/v1/scenes/${scene.id}/tokens`);
  await page.keyboard.press("Control+v");
  const created = await createdResponse;
  expect(created.ok(), await created.text()).toBe(true);
  const token = (await created.json()) as Token;
  const piece = board.getByRole("button", { name: /token Piece 01 Copy$/ });
  await piece.focus();
  const moveResponse = page.waitForResponse((response) => response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/api/v1/scenes/${scene.id}/tokens/move`);
  await page.keyboard.press("ArrowRight");
  const moved = await moveResponse;
  expect(moved.request().postDataJSON().changes).toContainEqual(expect.objectContaining({ tokenId: token.id, expectedUpdatedAt: token.updatedAt }));
  expect(moved.ok(), await moved.text()).toBe(true);
});

/** Waits until the board has stopped rendering, so a later difference belongs to the action under test. */
async function settledCounts(page: Page): Promise<RenderCounts> {
  let previous = await renderCounts(page);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(400);
    const current = await renderCounts(page);
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  throw new Error("The board never stopped rendering");
}

test("moving one token re-renders that token, not the board", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const { scene, tokens } = await createBusyScene(page);
  const board = await openScene(page, scene);
  const moved = tokens[9]!;
  const piece = board.getByRole("button", { name: new RegExp(`token ${moved.name}$`) });
  await piece.focus();
  const before = await settledCounts(page);

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await api<{ tokens: Token[] }>(page, "GET", `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${scene.id}`)).tokens.find((entry) => entry.id === moved.id)?.x).toBeGreaterThan(moved.x);
  const after = await settledCounts(page);

  // The moved token renders a handful of times (move, selection, confirmation; twice each under development strict mode).
  // Before memoisation every app render drew all 24 tokens, well over a hundred token renders for one move.
  const tokenRenders = after.token - before.token;
  expect(tokenRenders, "only the moved token should re-render").toBeGreaterThan(0);
  expect(tokenRenders, "only the moved token should re-render").toBeLessThan(tokenCount);
  expect(after.walls - before.walls, "walls did not change").toBe(0);
  expect(after.structureHandles - before.structureHandles, "wall and light handles did not change").toBe(0);
  expect(after.difficultTerrain - before.difficultTerrain).toBe(0);

  // The move itself still works and still shows.
  await expect.poll(() => piece.evaluate((element) => parseFloat((element as HTMLElement).style.left))).toBeGreaterThan((moved.x / scene.width) * 100);
});

test("zooming re-renders no token and no static layer", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const { scene } = await createBusyScene(page);
  const board = await openScene(page, scene);
  const before = await settledCounts(page);
  const widthBefore = (await board.boundingBox())!.width;

  const zoomIn = page.getByRole("button", { name: "Zoom battle map in", exact: true });
  for (let step = 0; step < 3; step += 1) await zoomIn.click();
  await expect.poll(async () => (await board.boundingBox())!.width).toBeGreaterThan(widthBefore * 1.2);
  const after = await settledCounts(page);

  const { scene: sceneBefore, ...layersBefore } = before;
  const { scene: sceneAfter, ...layersAfter } = after;
  expect(sceneAfter).toBeGreaterThan(sceneBefore);
  expect(layersAfter, "zoom resizes the board; nothing drawn in scene units needs to render again").toEqual(layersBefore);
  // Everything still sits where the zoomed board puts it.
  await expect(board.locator("button.token")).toHaveCount(tokenCount);
  await expect(board.locator(".wall-layer line")).toHaveCount(wallCount);
});

test("selecting a wall re-renders the handles and leaves the tokens alone", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const { scene } = await createBusyScene(page);
  const board = await openScene(page, scene);
  const before = await settledCounts(page);

  await board.locator(".structure-handle.door-handle").first().click();
  await expect(board.locator(".structure-handle.selected")).toHaveCount(1);
  const after = await settledCounts(page);

  expect(after.structureHandles - before.structureHandles, "the handle list shows the selection").toBeGreaterThan(0);
  expect(after.token - before.token, "no token changed").toBe(0);
  expect(after.walls - before.walls, "the wall lines did not change").toBe(0);
});

test("an incoming chat message leaves the scene component alone", async ({ page }) => {
  await login(page);
  await expect(page.locator(".scene-board")).toBeVisible();
  const showInspector = page.getByRole("button", { name: "Show inspector", exact: true });
  if (await showInspector.isVisible()) await showInspector.click();
  const inspector = page.getByRole("tablist", { name: "Inspector panels", exact: true });
  await inspector.getByRole("tab", { name: /^Chat/ }).click();
  const before = await settledCounts(page);
  expect(before.scene).toBeGreaterThan(0);

  const body = "Incoming table message " + crypto.randomUUID();
  await api(page, "POST", "/api/v1/chat/messages", { campaignId, body, type: "plain", visibility: "public" });
  await expect(page.getByRole("region", { name: "Chat", exact: true }).getByText(body, { exact: true })).toBeVisible();

  expect(await renderCounts(page)).toEqual(before);
});

test("a player sees the moved token and its updated vision on a second client", async ({ browser, page }) => {
  test.setTimeout(90_000);
  await login(page);
  const scenes = await api<Scene[]>(page, "GET", "/api/v1/campaigns/" + campaignId + "/scenes");
  const previous = scenes.find((scene) => scene.active);
  const campaign = await api<Campaign>(page, "GET", "/api/v1/campaigns/" + campaignId);
  const scene = await api<Scene>(page, "POST", "/api/v1/campaigns/" + campaignId + "/scenes", {
    name: "Vision reconciliation " + crypto.randomUUID().slice(0, 8),
    width: 800, height: 600, gridType: "square", gridSize: 50, visibilityMode: "fog",
    expectedUpdatedAt: campaign.updatedAt,
  });
  const scenePath = "/api/v1/scenes/" + scene.id;
  const player = await browser.newPage({ baseURL: webBaseUrl, viewport: { width: 1440, height: 900 } });
  try {
    await api(page, "POST", scenePath + "/fog", {
      x: 650, y: 450, radius: 50, hidden: false, expectedUpdatedAt: scene.updatedAt,
    });
    const fogged = await api<Scene>(page, "GET", scenePath);
    const token = await api<Token>(page, "POST", scenePath + "/tokens", {
      name: "Player lantern", x: 200, y: 200, width: 50, height: 50, visionEnabled: true, visionRadius: 150,
      ownerUserIds: ["usr_demo_player"], expectedUpdatedAt: fogged.updatedAt,
    });
    const prepared = await api<Scene>(page, "GET", scenePath);
    await api(page, "PATCH", scenePath, { active: true, expectedUpdatedAt: prepared.updatedAt });
    await page.reload();
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await page.locator(".scene-tab").filter({ hasText: scene.name }).click();
    await login(player);
    const sessionUser = player.getByRole("combobox", { name: "Session user", exact: true });
    await sessionUser.selectOption("usr_demo_player");
    await expect(sessionUser).toHaveValue("usr_demo_player");
    await expect(player.locator(".session-pulse")).toHaveAttribute("data-connection-state", "connected");
    const tokenSelector = ".scene-board button[data-token-id='" + token.id + "']";
    const playerToken = player.locator(tokenSelector);
    await expect(playerToken).toBeVisible();
    const outline = player.locator(".scene-board .vision-mask-layer .vision-outline.token").first();
    await expect(outline).toHaveAttribute("points", /\d/);
    const oldOutline = await outline.getAttribute("points");
    const oldPosition = await playerToken.evaluate((element) => element.style.left);

    const moved = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === scenePath + "/tokens/move");
    await page.locator(tokenSelector).press("ArrowRight");
    expect((await moved).ok()).toBe(true);
    await expect.poll(() => playerToken.evaluate((element) => element.style.left)).not.toBe(oldPosition);
    await expect.poll(() => outline.getAttribute("points")).not.toBe(oldOutline);
  } finally {
    await player.close();
    if (previous) {
      const path = "/api/v1/scenes/" + previous.id;
      const latest = await api<Scene>(page, "GET", path);
      await api(page, "PATCH", path, { active: true, expectedUpdatedAt: latest.updatedAt });
    }
  }
});
