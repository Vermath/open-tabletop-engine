import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Actor, Campaign, ChatMessage, Handout, Scene, Token, VisionSnapshot } from "../../packages/core/src/types.js";
interface PlayerPreviewResponse { player: { id: string; displayName: string }; snapshot: TableSnapshot }

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";
const playerId = "usr_demo_player";
const gmId = "usr_demo_gm";
const artifactDir = resolve("output/competitive/map-preview");
const fixturePath = resolve("tests/e2e/fixtures/offset-grid.png");
interface TableSnapshot { user: { id: string }; scenes: Scene[]; tokens: Token[]; actors: Actor[]; chat: ChatMessage[]; handouts: Handout[]; vision?: VisionSnapshot }

async function api<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  const result = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method, data,
    headers: { authorization: "Bearer otte-cookie-session", origin: webBaseUrl, ...(method === "GET" ? {} : { "idempotency-key": `map-preview:${crypto.randomUUID()}` }) },
  });
  const body = await result.text();
  expect(result.ok(), `${method} ${path}: ${body}`).toBe(true);
  return JSON.parse(body) as T;
}
async function createRecord<T>(page: Page, collection: "scenes" | "actors" | "handouts", data: unknown): Promise<T> {
  const campaign = await api<Campaign>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  return api<T>(page, "POST", `/api/v1/campaigns/${campaignId}/${collection}`, { ...(data as object), expectedUpdatedAt: campaign.updatedAt });
}
async function createToken(page: Page, sceneId: string, data: Partial<Token>): Promise<Token> {
  const scene = await api<Scene>(page, "GET", `/api/v1/scenes/${sceneId}`);
  return api<Token>(page, "POST", `/api/v1/scenes/${sceneId}/tokens`, { ...data, expectedUpdatedAt: scene.updatedAt });
}
async function login(page: Page, role: "Demo GM" | "Demo Player") {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  if (role === "Demo Player") {
    const userSelector = page.getByRole("combobox", { name: "Session user", exact: true });
    await expect(userSelector).toBeVisible();
    await userSelector.selectOption(playerId);
    await expect(userSelector).toHaveValue(playerId);
  }
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const cookies = await page.context().cookies(apiBaseUrl);
  expect(cookies.some((cookie) => cookie.name === "otte_session" || cookie.name === "__Host-otte_session")).toBe(true);
  await expect.poll(async () => (await tableSnapshot(page, "scn_vault_entry")).user.id).toBe(role === "Demo GM" ? gmId : playerId);
}
async function openScene(page: Page, scene: Scene, prep = false) {
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.getByRole("button", { name: prep ? "Prep" : "Live Table", exact: true }).click();
  const tab = page.locator(".scene-tab").filter({ hasText: scene.name });
  await expect(tab).toBeVisible();
  await tab.click();
  const showScene = page.getByRole("button", { name: "Show scene", exact: true });
  if (await showScene.isVisible()) await showScene.click();
  const board = page.getByRole("group", { name: `${scene.name} interactive battle map`, exact: true });
  await expect(board).toBeVisible();
  return board;
}
async function tableSnapshot(page: Page, sceneId: string): Promise<TableSnapshot> {
  return api<TableSnapshot>(page, "GET", `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`);
}
async function tokenPresentation(board: Locator) {
  return board.locator(".token").evaluateAll((elements) => elements.map((element) => ({
    name: element.querySelector(".token-nameplate")?.textContent,
    hpWidth: (element.querySelector(".token-hp > span") as HTMLElement | null)?.style.width ?? null,
  })).sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "")));
}

async function mapGeometry(board: Locator) {
  return board.evaluate((element) => {
    const board = element as HTMLElement;
    const image = board.querySelector<HTMLImageElement>(".scene-map")!;
    const grid = board.querySelector<HTMLElement>(".grid-lines")!;
    const rect = image.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const style = getComputedStyle(grid);
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
    for (let ancestor = image.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const ancestorStyle = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(ancestorStyle.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(auto|scroll|hidden|clip)/.test(ancestorStyle.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return {
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, objectFit: getComputedStyle(image).objectFit,
      imageWidth: rect.width, imageHeight: rect.height, boardLeft: boardRect.left, boardTop: boardRect.top, boardWidth: boardRect.width, boardHeight: boardRect.height,
      visibleImageFraction: Math.max(0, right - left) * Math.max(0, bottom - top) / (rect.width * rect.height),
      gridCellX: parseFloat(style.backgroundSize.split(" ")[0]!) * 1020 / 100,
      gridCellY: parseFloat(style.backgroundSize.split(" ")[1]!) * 760 / 100,
      gridOriginX: parseFloat(style.backgroundPositionX) / parseFloat(board.style.width) * 1020,
      gridOriginY: parseFloat(style.backgroundPositionY) / parseFloat(board.style.height) * 760,
      landmarks: [{ name: "A", x: 23, y: 17 }, { name: "B", x: 498, y: 17 }, { name: "C", x: 973, y: 729.5 }].map((point) => {
        const x = rect.left + point.x / 1020 * rect.width, y = rect.top + point.y / 760 * rect.height;
        const topmost = document.elementFromPoint(x, y);
        return { ...point, visible: x >= left && x <= right && y >= top && y <= bottom, unobscured: Boolean(topmost && board.contains(topmost)), occludingElement: topmost && !board.contains(topmost) ? `${topmost.tagName}.${topmost.getAttribute("class") ?? ""}` : null };
      }),
    };
  });
}

test.beforeAll(() => mkdirSync(artifactDir, { recursive: true }));

test("competitive map upload preserves native edges, offset calibration, and fractional token snapping after reload", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "Demo GM");
  await page.setViewportSize({ width: 1280, height: 720 });
  const scene = await createRecord<Scene>(page, "scenes", { name: "Offset map browser evidence", width: 300, height: 240, gridType: "square", gridSize: 50, active: true, metadata: { gridOverlayVisible: true } } satisfies Partial<Scene>);
  let board = await openScene(page, scene, true);
  expect((await tableSnapshot(page, scene.id)).tokens.filter((token) => token.sceneId === scene.id)).toEqual([]);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const sceneManager = page.getByRole("region", { name: "Manage workspace panel" });
  await sceneManager.locator(".manage-category-button", { hasText: "Scenes" }).click();
  await expect(page.getByRole("form", { name: `Edit scene ${scene.name}`, exact: true })).toBeVisible();
  await page.locator("#map-upload-file").setInputFiles(fixturePath);
  const calibration = page.locator(".grid-calibration-panel");
  await expect(calibration.getByRole("heading", { name: "Match the map grid" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Place offset-grid.png", exact: true })).toHaveCount(0);
  const uploaded = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  expect(uploaded).toMatchObject({ width: 1020, height: 760 });
  expect(uploaded.backgroundAssetId).toBeTruthy();
  for (const [label, value] of [["First calibration point X", "23"], ["First calibration point Y", "17"], ["Second calibration point X", "498"], ["Second calibration point Y", "17"], ["Grid cells between calibration points", "10"]]) {
    await calibration.getByRole("spinbutton", { name: label! }).fill(value!);
  }
  await expect(calibration.getByRole("status")).toContainText("Recommended grid: 47.5 px");
  await expect(calibration.getByRole("status")).toContainText("Grid origin: 23, 17 px");
  await calibration.getByRole("button", { name: "Apply square grid", exact: true }).click();
  await expect(calibration).toBeHidden();
  await expect.poll(async () => (await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`)).gridSize).toBe(47.5);
  const calibrated = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  expect(calibrated).toMatchObject({ width: 1020, height: 760, gridSize: 47.5, gridOrigin: { x: 23, y: 17 }, metadata: { mapCalibrationComplete: true } });
  await expect(board.locator(".scene-map")).toBeVisible();
  await expect.poll(() => board.locator(".scene-map").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1020);
  const defaultGeometry = await mapGeometry(board);
  await page.screenshot({ path: resolve(artifactDir, "offset-grid-default-controls.png"), fullPage: true });
  await page.getByRole("button", { name: "Hide inspector", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show inspector", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(artifactDir, "offset-grid-inspector-hidden.png"), fullPage: true });
  const inspectorWideGeometry = await mapGeometry(board);
  const interventions = ["Hide inspector"];
  if (!inspectorWideGeometry.landmarks.every((point) => point.visible && point.unobscured)) {
    await page.getByRole("button", { name: "Zoom battle map out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset battle map zoom from 75%", exact: true })).toBeVisible();
    interventions.push("Zoom out once to 75%");
  }
  const geometry = await mapGeometry(board);
  const mapEvidence = { viewport: page.viewportSize(), defaultGeometry, inspectorWideGeometry, interventions, geometry, calibratedScene: { width: calibrated.width, height: calibrated.height, gridSize: calibrated.gridSize, gridOrigin: calibrated.gridOrigin }, expectedTokenAfterDrag: { x: 260.5, y: 254.5 } };
  writeFileSync(resolve(artifactDir, "map-metrics.json"), JSON.stringify({ ...mapEvidence, status: "calibrated_before_drag" }, null, 2));
  expect(geometry.naturalHeight).toBe(760);
  expect(geometry.imageWidth / geometry.imageHeight).toBeCloseTo(1020 / 760, 2);
  expect(geometry.visibleImageFraction).toBeGreaterThan(0.98);
  expect(geometry.landmarks.every((point) => point.visible)).toBe(true);
  expect(geometry.landmarks.every((point) => point.unobscured), "Authored edge landmarks must not be covered by floating controls after recorded view adjustments").toBe(true);
  expect(geometry.gridCellX).toBeCloseTo(47.5, 3);
  expect(geometry.gridCellY).toBeCloseTo(47.5, 3);
  expect(geometry.gridOriginX).toBeCloseTo(23, 2);
  expect(geometry.gridOriginY).toBeCloseTo(17, 2);
  await page.screenshot({ path: resolve(artifactDir, "offset-grid-calibrated.png"), fullPage: true });

  const created = await createToken(page, scene.id, { name: "Fractional grid scout", x: 213, y: 207, width: 47.5, height: 47.5, ownerUserIds: [gmId] });
  const token = board.getByRole("button", { name: "Player Objects & Tokens token Fractional grid scout", exact: true });
  await expect(token).toBeVisible();
  const tokenBox = await token.boundingBox();
  const boardBox = await board.boundingBox();
  expect(tokenBox).toBeTruthy(); expect(boardBox).toBeTruthy();
  const movedResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/scenes/${scene.id}/tokens/move`));
  await page.mouse.move(tokenBox!.x + tokenBox!.width / 2, tokenBox!.y + tokenBox!.height / 2);
  await page.mouse.down();
  const boardDuringDrag = await board.boundingBox();
  writeFileSync(resolve(artifactDir, "map-metrics.json"), JSON.stringify({ ...mapEvidence, status: "pointer_down", boardBeforeDrag: boardBox, boardDuringDrag }, null, 2));
  await expect(page.getByRole("button", { name: "Show inspector", exact: true })).toBeVisible();
  expect(boardDuringDrag).toEqual(boardBox);
  await page.mouse.move(tokenBox!.x + tokenBox!.width / 2 + 52 * boardBox!.width / 1020, tokenBox!.y + tokenBox!.height / 2 + 48 * boardBox!.height / 760, { steps: 8 });
  await page.mouse.up();
  const movedHttp = await movedResponse;
  expect(movedHttp.ok()).toBe(true);
  const moved = (await movedHttp.json() as { tokens: Token[] }).tokens.find((candidate) => candidate.id === created.id)!;
  writeFileSync(resolve(artifactDir, "map-metrics.json"), JSON.stringify({ ...mapEvidence, status: "drag_completed", boardBeforeDrag: boardBox, boardDuringDrag, tokenAfterDrag: { x: moved.x, y: moved.y } }, null, 2));
  await page.screenshot({ path: resolve(artifactDir, "offset-grid-token-dragged.png"), fullPage: true });
  expect(moved).toMatchObject({ x: 260.5, y: 254.5 });
  await expect(token).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Hide inspector", exact: true })).toBeVisible();
  board = await openScene(page, scene, true);
  const reloaded = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  const reloadedToken = (await tableSnapshot(page, scene.id)).tokens.find((candidate) => candidate.id === created.id)!;
  expect(reloaded).toMatchObject({ width: 1020, height: 760, gridSize: 47.5, gridOrigin: { x: 23, y: 17 } });
  expect(reloadedToken).toMatchObject({ x: 260.5, y: 254.5 });
  await expect(board.getByRole("button", { name: "Player Objects & Tokens token Fractional grid scout", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(artifactDir, "offset-grid-token-reloaded.png"), fullPage: true });
  writeFileSync(resolve(artifactDir, "map-metrics.json"), JSON.stringify({ ...mapEvidence, status: "passed", boardBeforeDrag: boardBox, boardDuringDrag, tokenAfterDrag: { x: moved.x, y: moved.y }, tokenAfterReload: { x: reloadedToken.x, y: reloadedToken.y } }, null, 2));
});

test("competitive player preview matches a separate authenticated player's table and preserves the GM workspace", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page, "Demo GM");
  const scene = await createRecord<Scene>(page, "scenes", { name: "Player preview browser evidence", width: 800, height: 600, gridType: "square", gridSize: 50, active: true, fog: [{ id: "fog_preview_browser", x: 250, y: 200, radius: 230, hidden: false }] } satisfies Partial<Scene>);
  const hero = await createRecord<Actor>(page, "actors", { name: "Preview Hero", systemId: "generic-fantasy", type: "character", ownerUserId: playerId, data: { hp: { current: 7, max: 13 } } } satisfies Partial<Actor>);
  const npc = await createRecord<Actor>(page, "actors", { name: "Preview Sentinel", systemId: "generic-fantasy", type: "npc", ownerUserId: gmId, data: { hp: { current: 99, max: 123 }, secret: "BROWSER_PRIVATE_ACTOR" } } satisfies Partial<Actor>);
  const playerToken = await createToken(page, scene.id, { actorId: hero.id, name: "Preview Hero", x: 180, y: 180, ownerUserIds: [playerId], disposition: "friendly" });
  await createToken(page, scene.id, { actorId: npc.id, name: "Preview Sentinel", x: 260, y: 180, ownerUserIds: [], disposition: "hostile" });
  const gmToken = await createToken(page, scene.id, { name: "GM workspace marker", x: 340, y: 180, ownerUserIds: [gmId], disposition: "friendly" });
  await createToken(page, scene.id, { actorId: npc.id, name: "BROWSER_PRIVATE_TOKEN", x: 650, y: 450, layer: "gm", hidden: true });
  for (const [visibility, title, body] of [["public", "Browser public clue", "The silver door opens at dawn."], ["gm_only", "BROWSER_PRIVATE_HANDOUT", "The hidden ambush waits."]] as const) {
    await createRecord<Handout>(page, "handouts", { title, body, visibility, assetIds: [] } satisfies Partial<Handout>);
  }
  for (const [visibility, body, recipientUserIds] of [["public", "Browser public table message", []], ["gm_only", "BROWSER_PRIVATE_CHAT", []], ["whisper", "Browser GM whisper to player", [playerId]]] as const) {
    await api<ChatMessage>(page, "POST", "/api/v1/chat/messages", { campaignId, sceneId: scene.id, body, visibility, recipientUserIds });
  }
  const board = await openScene(page, scene);
  const selected = board.getByRole("button", { name: "Player Objects & Tokens token GM workspace marker", exact: true });
  await selected.click();
  const movedResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/scenes/${scene.id}/tokens/move`));
  await selected.press("ArrowRight");
  expect((await movedResponse).ok()).toBe(true);
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  const gmBefore = await tableSnapshot(page, scene.id);
  const selectedIdsBefore = await board.locator(".token.selected .token-nameplate").allTextContents();
  const workspaceBefore = await page.evaluate(() => ({ sceneId: localStorage.getItem("otte:selectedSceneId"), actorId: localStorage.getItem("otte:selectedActorId"), userId: localStorage.getItem("otte:userId") }));

  const playerContext = await browser.newContext({ baseURL: webBaseUrl, extraHTTPHeaders: { Origin: webBaseUrl }, viewport: { width: 1600, height: 1000 } });
  try {
    const playerPage = await playerContext.newPage();
    await login(playerPage, "Demo Player");
    const actualBoard = await openScene(playerPage, scene);
    await expect(actualBoard.getByRole("button", { name: "Player Objects & Tokens token Preview Hero", exact: true })).toBeVisible();
    await expect(actualBoard.getByRole("button", { name: /BROWSER_PRIVATE_TOKEN/ })).toHaveCount(0);
    await playerPage.locator(".inspector-tabs").getByRole("tab", { name: "Chat", exact: true }).click();
    const playerChat = playerPage.getByRole("textbox", { name: "Chat message", exact: true });
    await playerChat.fill("Browser message from authenticated player");
    await playerChat.press("Enter");
    await expect(playerPage.getByLabel("Chat messages").locator(".chat-body").filter({ hasText: "Browser message from authenticated player" })).toBeVisible();
    const actual = await tableSnapshot(playerPage, scene.id);
    expect(actual.actors.find((actor) => actor.id === hero.id)?.data.hp).toEqual({ current: 7, max: 13 });
    expect(actual.actors.find((actor) => actor.id === npc.id)?.data).toEqual({});
    const actualPresentation = await tokenPresentation(actualBoard);
    expect(actualPresentation.find((token) => token.name === "Preview Hero")?.hpWidth).toBe("54%");
    expect(actualPresentation.find((token) => token.name === "Preview Sentinel")?.hpWidth).toBeNull();
    const actualMessages = actual.chat.map((message) => message.body);
    // Roll cards and emotes render their bodies outside .chat-body. Count the
    // whole message stream before comparing the preview's plain-text projection.
    await expect(playerPage.getByLabel("Chat messages").locator(".chat-message")).toHaveCount(actualMessages.length);
    await playerPage.screenshot({ path: resolve(artifactDir, "authenticated-player-table.png"), fullPage: true });

    await page.getByLabel("Advanced tools", { exact: true }).click();
    const previewResponse = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes(`/scenes/${scene.id}/player-preview?`));
    await page.getByRole("button", { name: "Preview player view", exact: true }).click();
    const previewHttp = await previewResponse;
    expect(previewHttp.ok()).toBe(true);
    const payload = await previewHttp.json() as PlayerPreviewResponse;
    expect(payload.player.id).toBe(playerId);
    const dialog = page.getByRole("dialog", { name: "Player view", exact: true });
    const previewBoard = dialog.getByRole("group", { name: `${scene.name} read-only player map`, exact: true });
    await expect(previewBoard).toBeVisible();
    expect(payload.snapshot.tokens.map((token) => token.id).sort()).toEqual(actual.tokens.filter((token) => token.sceneId === scene.id).map((token) => token.id).sort());
    expect(payload.snapshot.actors.find((actor) => actor.id === hero.id)?.data.hp).toEqual(actual.actors.find((actor) => actor.id === hero.id)?.data.hp);
    expect(payload.snapshot.actors.find((actor) => actor.id === npc.id)?.data).toEqual({});
    const previewPresentation = await tokenPresentation(previewBoard);
    expect(previewPresentation).toEqual(actualPresentation);
    await expect(dialog).not.toContainText("BROWSER_PRIVATE_");
    await page.screenshot({ path: resolve(artifactDir, "gm-player-preview-table.png"), fullPage: true });

    await dialog.getByRole("button", { name: "Exit player view", exact: true }).focus();
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+z");
    const gmDuring = await tableSnapshot(page, scene.id);
    expect(gmDuring.tokens.filter((token) => token.sceneId === scene.id)).toEqual(gmBefore.tokens.filter((token) => token.sceneId === scene.id));
    await dialog.getByRole("button", { name: "Chat", exact: true }).click();
    const previewMessages = await dialog.getByRole("region", { name: "Preview chat" }).locator("article > p").allTextContents();
    expect(previewMessages).toEqual(actualMessages);
    await expect(dialog).not.toContainText("BROWSER_PRIVATE_CHAT");
    await page.screenshot({ path: resolve(artifactDir, "gm-player-preview-chat.png"), fullPage: true });

    await playerPage.locator(".inspector-tabs").getByRole("tab", { name: "Handouts", exact: true }).click();
    const library = playerPage.getByRole("region", { name: "Handout Library" });
    await expect(library).toBeVisible();
    await library.getByRole("button").filter({ hasText: "Browser public clue" }).click();
    await expect(library).toContainText("The silver door opens at dawn.");
    await expect(library).not.toContainText("BROWSER_PRIVATE_HANDOUT");
    await dialog.getByRole("button", { name: "Handouts", exact: true }).click();
    const previewHandouts = dialog.getByRole("region", { name: "Preview handouts" });
    await expect(previewHandouts).toContainText("Browser public clue");
    await expect(previewHandouts).toContainText("The silver door opens at dawn.");
    expect(await previewHandouts.locator("article h3").allTextContents()).toEqual(actual.handouts.map((handout) => handout.title));
    await expect(previewHandouts).not.toContainText("BROWSER_PRIVATE_HANDOUT");
    await page.screenshot({ path: resolve(artifactDir, "gm-player-preview-handouts.png"), fullPage: true });
    await playerPage.screenshot({ path: resolve(artifactDir, "authenticated-player-handouts.png"), fullPage: true });

    await dialog.getByRole("button", { name: "Exit player view", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await board.locator(".token.selected .token-nameplate").allTextContents()).toEqual(selectedIdsBefore);
    expect(await page.evaluate(() => ({ sceneId: localStorage.getItem("otte:selectedSceneId"), actorId: localStorage.getItem("otte:selectedActorId"), userId: localStorage.getItem("otte:userId") }))).toEqual(workspaceBefore);
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    const gmAfter = await tableSnapshot(page, scene.id);
    expect(gmAfter.tokens.find((token) => token.id === gmToken.id)).toEqual(gmBefore.tokens.find((token) => token.id === gmToken.id));
    await page.screenshot({ path: resolve(artifactDir, "gm-workspace-after-preview.png"), fullPage: true });
    writeFileSync(resolve(artifactDir, "preview-metrics.json"), JSON.stringify({ viewport: page.viewportSize(), playerId: payload.player.id, playerTokenId: playerToken.id, actualPresentation, previewPresentation, actualMessages, previewMessages, visibleHandoutTitles: actual.handouts.map((handout) => handout.title), workspaceBefore, selectedIdsBefore, gmMutationKeysBlocked: ["Delete", "Control+z"], actorHp: actual.actors.find((actor) => actor.id === hero.id)?.data.hp, privateNpcDataRedacted: Object.keys(actual.actors.find((actor) => actor.id === npc.id)?.data ?? {}).length === 0 }, null, 2));
  } finally { await playerContext.close(); }
});

test("competitive populated map replacement preserves authored geometry and creates a separate inactive map scene", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "Demo GM");
  const scene = await createRecord<Scene>(page, "scenes", { name: "Prepared map preservation evidence", width: 300, height: 240, gridType: "square", gridSize: 50, active: true } satisfies Partial<Scene>);
  await openScene(page, scene, true);
  async function openUpload() {
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("region", { name: "Manage workspace panel" }).locator(".manage-category-button", { hasText: "Scenes" }).click();
    await expect(page.getByRole("form", { name: `Edit scene ${scene.name}`, exact: true })).toBeVisible();
  }
  await openUpload();
  await page.locator("#map-upload-file").setInputFiles(fixturePath);
  await expect(page.locator(".grid-calibration-panel").getByRole("heading", { name: "Match the map grid" })).toBeVisible();
  const mapped = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  expect(mapped.backgroundAssetId).toBeTruthy();
  const preparedFields = {
    width: 1200, height: 800, gridSize: 37.5, gridOrigin: { x: 8.25, y: 12.5 },
    walls: [{ id: "wall_preservation", x1: 13.5, y1: 25.25, x2: 430.25, y2: 25.25, blocksVision: true, blocksMovement: true }],
    lights: [{ id: "light_preservation", x: 76.5, y: 84.25, radius: 130.5, color: "#f9ca66" }],
    fog: [{ id: "fog_preservation", x: 500.25, y: 350.5, radius: 240.75, hidden: false }],
    metadata: { preservationNote: "Authored geometry must remain exact", mapCalibrationComplete: true },
  } satisfies Partial<Scene>;
  const prepared = await api<Scene>(page, "PATCH", `/api/v1/scenes/${scene.id}`, { ...preparedFields, expectedUpdatedAt: mapped.updatedAt });
  expect(prepared).toMatchObject(preparedFields);
  await createToken(page, scene.id, { name: "Preserved fractional token", x: 143.5, y: 91.25, width: 37.5, height: 37.5, ownerUserIds: [gmId] });
  const annotationRevision = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  await api(page, "POST", `/api/v1/scenes/${scene.id}/annotations`, { kind: "drawing", label: "Preserved drawing", color: "#a5d8ff", points: [{ x: 200.5, y: 220.25 }, { x: 310.75, y: 275.5 }], expectedUpdatedAt: annotationRevision.updatedAt });
  const before = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  const tokensBefore = (await tableSnapshot(page, scene.id)).tokens.filter((token) => token.sceneId === scene.id);
  const preservedGeometry = ({ width, height, gridType, gridSize, gridOrigin, walls, lights, fog, annotations, active }: Scene) => ({ width, height, gridType, gridSize, gridOrigin, walls, lights, fog, annotations, active });
  expect(before.annotations).toHaveLength(1);
  await openScene(page, scene, true);
  await openUpload();
  await page.locator("#map-upload-file").setInputFiles(resolve("tests/e2e/fixtures/map-square.png"));
  const keepDialog = page.getByRole("dialog", { name: "Place map-square.png", exact: true });
  await expect(keepDialog).toContainText("Current canvas: 1200 × 800 px. Image: 800 × 800 px.");
  await page.screenshot({ path: resolve(artifactDir, "populated-map-review.png"), fullPage: true });
  await keepDialog.getByRole("button", { name: "Keep canvas and replace map", exact: true }).click();
  await expect(page.locator(".grid-calibration-panel")).toBeVisible();
  await expect.poll(async () => (await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`)).backgroundAssetId).not.toBe(before.backgroundAssetId);
  const kept = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  expect(preservedGeometry(kept)).toEqual(preservedGeometry(before));
  expect(kept.metadata).toMatchObject({ preservationNote: "Authored geometry must remain exact", mapCalibrationComplete: false });
  expect((await tableSnapshot(page, scene.id)).tokens.filter((token) => token.sceneId === scene.id)).toEqual(tokensBefore);
  await openScene(page, scene, true);
  const keptReloaded = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  expect(preservedGeometry(keptReloaded)).toEqual(preservedGeometry(before));
  expect(keptReloaded.backgroundAssetId).toBe(kept.backgroundAssetId);
  await page.screenshot({ path: resolve(artifactDir, "populated-map-replaced.png"), fullPage: true });

  const scenesBeforeNew = await api<Scene[]>(page, "GET", `/api/v1/campaigns/${campaignId}/scenes`);
  const activeSceneIdsBefore = scenesBeforeNew.filter((candidate) => candidate.active).map((candidate) => candidate.id).sort();
  expect(activeSceneIdsBefore).toContain(scene.id);
  await openUpload();
  await page.locator("#map-upload-file").setInputFiles(resolve("tests/e2e/fixtures/map-portrait.png"));
  const newDialog = page.getByRole("dialog", { name: "Place map-portrait.png", exact: true });
  await expect(newDialog).toContainText("Image: 760 × 1020 px.");
  const createdResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/campaigns/${campaignId}/scenes`));
  await newDialog.getByRole("button", { name: "Create new scene at image size", exact: true }).click();
  const createdHttp = await createdResponse;
  expect(createdHttp.ok()).toBe(true);
  const newScene = await createdHttp.json() as Scene;
  expect(newScene.id).not.toBe(scene.id);
  expect(newScene).toMatchObject({ name: "map-portrait", width: 760, height: 1020, gridSize: 37.5, gridOrigin: { x: 0, y: 0 }, active: false, walls: [], lights: [], fog: [], annotations: [] });
  expect(newScene.backgroundAssetId).toBeTruthy();
  await openScene(page, newScene, true);
  const sourceAfterNew = await api<Scene>(page, "GET", `/api/v1/scenes/${scene.id}`);
  const newReloaded = await api<Scene>(page, "GET", `/api/v1/scenes/${newScene.id}`);
  const activeSceneIdsAfter = (await api<Scene[]>(page, "GET", `/api/v1/campaigns/${campaignId}/scenes`)).filter((candidate) => candidate.active).map((candidate) => candidate.id).sort();
  expect(sourceAfterNew).toEqual(keptReloaded);
  expect(newReloaded).toMatchObject({ width: 760, height: 1020, active: false });
  expect(activeSceneIdsAfter).toEqual(activeSceneIdsBefore);
  expect((await tableSnapshot(page, scene.id)).tokens.filter((token) => token.sceneId === scene.id)).toEqual(tokensBefore);
  expect((await tableSnapshot(page, newScene.id)).tokens.filter((token) => token.sceneId === newScene.id)).toEqual([]);
  await page.screenshot({ path: resolve(artifactDir, "populated-map-new-inactive-scene.png"), fullPage: true });
  writeFileSync(resolve(artifactDir, "populated-map-metrics.json"), JSON.stringify({ status: "passed", sourceSceneId: scene.id, sourceBefore: preservedGeometry(before), sourceAfter: preservedGeometry(sourceAfterNew), originalBackgroundAssetId: before.backgroundAssetId, replacementBackgroundAssetId: sourceAfterNew.backgroundAssetId, tokensBefore, activeSceneIdsBefore, activeSceneIdsAfter, newScene: { id: newScene.id, width: newReloaded.width, height: newReloaded.height, active: newReloaded.active } }, null, 2));
});

test("competitive unlinked token keeps its editor separate from actor selection and linked actor vitals", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "Demo GM");
  const scene = await createRecord<Scene>(page, "scenes", { name: "Unlinked token actor binding evidence", width: 800, height: 600, gridType: "square", gridSize: 50, active: true } satisfies Partial<Scene>);
  const intentionalActor = await createRecord<Actor>(page, "actors", { name: "Intentional actor selection", systemId: "generic-fantasy", type: "character", ownerUserId: gmId, data: { hp: { current: 31, max: 40 } } } satisfies Partial<Actor>);
  const linkedActor = await createRecord<Actor>(page, "actors", { name: "Actually linked actor", systemId: "generic-fantasy", type: "character", ownerUserId: gmId, data: { hp: { current: 7, max: 13 } } } satisfies Partial<Actor>);
  const unlinkedToken = await createToken(page, scene.id, { name: "Unlinked marker", x: 200, y: 200, ownerUserIds: [gmId] });
  const linkedToken = await createToken(page, scene.id, { name: "Linked marker", actorId: linkedActor.id, x: 400, y: 200, ownerUserIds: [gmId] });
  expect(unlinkedToken.actorId).toBeUndefined();
  const actorIds = new Set([intentionalActor.id, linkedActor.id]);
  const actorsBefore = (await tableSnapshot(page, scene.id)).actors.filter((actor) => actorIds.has(actor.id));
  const board = await openScene(page, scene, true);
  const inspector = page.getByRole("complementary", { name: "Inspector", exact: true });
  const chooseIntentionalActor = () => page.getByRole("region", { name: "Party", exact: true }).getByRole("button", { name: /Intentional actor selection/ }).click();
  await chooseIntentionalActor();
  await expect(inspector.getByRole("heading", { name: intentionalActor.name, exact: true })).toBeVisible();
  await expect(board.locator(".token.selected")).toHaveCount(0);
  await expect(inspector.getByRole("group", { name: "Adjust hit points", exact: true })).toBeVisible();
  await board.getByRole("button", { name: "Player Objects & Tokens token Unlinked marker", exact: true }).click();
  await expect(inspector.getByRole("heading", { name: intentionalActor.name, exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("heading", { name: linkedActor.name, exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("heading", { name: "Valen Ash", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("group", { name: "Adjust hit points", exact: true })).toHaveCount(0);
  await expect(inspector.locator('[title="Linked token"]')).toHaveCount(0);
  const tokenEditor = inspector.locator(".actor-token-editor");
  await expect(tokenEditor).toBeVisible();
  if ((await tokenEditor.getAttribute("open")) === null) await tokenEditor.locator("summary").click();
  await expect(inspector.getByRole("combobox", { name: "Token inspector actor", exact: true })).toHaveValue("");
  const tokenName = inspector.getByRole("textbox", { name: "Token inspector name", exact: true });
  await tokenName.fill("Renamed unlinked marker");
  const renameResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/tokens/${unlinkedToken.id}`));
  await tokenName.press("Tab");
  expect((await renameResponse).ok()).toBe(true);
  await expect.poll(async () => (await tableSnapshot(page, scene.id)).tokens.find((token) => token.id === unlinkedToken.id)?.name).toBe("Renamed unlinked marker");
  const renamed = (await tableSnapshot(page, scene.id)).tokens.find((token) => token.id === unlinkedToken.id)!;
  expect(renamed.actorId).toBeUndefined();
  expect(renamed).toMatchObject({ x: unlinkedToken.x, y: unlinkedToken.y });
  await page.screenshot({ path: resolve(artifactDir, "unlinked-token-editor.png"), fullPage: true });

  await chooseIntentionalActor();
  await expect(board.locator(".token.selected")).toHaveCount(0);
  await expect(inspector.getByRole("heading", { name: intentionalActor.name, exact: true })).toBeVisible();
  await expect(inspector.getByRole("group", { name: "Adjust hit points", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(artifactDir, "intentional-actor-without-token.png"), fullPage: true });
  await board.getByRole("button", { name: "Player Objects & Tokens token Linked marker", exact: true }).click();
  await expect(inspector.getByRole("heading", { name: linkedActor.name, exact: true })).toBeVisible();
  await expect(inspector.locator('[title="Linked token"]')).toHaveText(linkedToken.name);
  await expect(inspector.getByRole("group", { name: "Adjust hit points", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(artifactDir, "linked-token-actor-editor.png"), fullPage: true });
  await board.getByRole("button", { name: "Player Objects & Tokens token Renamed unlinked marker", exact: true }).click();
  await expect(inspector.getByRole("group", { name: "Adjust hit points", exact: true })).toHaveCount(0);
  const actorsAfter = (await tableSnapshot(page, scene.id)).actors.filter((actor) => actorIds.has(actor.id));
  expect(actorsAfter).toEqual(actorsBefore);
  writeFileSync(resolve(artifactDir, "unlinked-token-metrics.json"), JSON.stringify({ status: "passed", sceneId: scene.id, unlinkedTokenId: unlinkedToken.id, renamedToken: { name: renamed.name, actorId: renamed.actorId ?? null, x: renamed.x, y: renamed.y }, intentionalActorId: intentionalActor.id, linkedActorId: linkedActor.id, linkedTokenId: linkedToken.id, unrelatedActorEditorAbsentForUnlinkedToken: true, tokenEditingRetained: true, deliberateActorSelectionWithoutTokenRetained: true, linkedActorSelectionRetained: true, actorRecordsUnchanged: true }, null, 2));
});
