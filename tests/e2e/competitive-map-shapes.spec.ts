import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Campaign, Scene, Token } from "../../packages/core/src/types.js";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";
const artifactDir = resolve("output/competitive/map-preview/shapes");
const shapes = [
  { name: "portrait", width: 760, height: 1020, filename: "map-portrait.png" },
  { name: "square", width: 800, height: 800, filename: "map-square.png" },
] as const;
type MapShape = typeof shapes[number];
interface TableSnapshot { user: { id: string }; tokens: Token[] }

async function api<T>(page: Page, method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method, data,
    headers: { authorization: "Bearer otte-cookie-session", origin: webBaseUrl, ...(method === "GET" ? {} : { "idempotency-key": `map-shapes:${crypto.randomUUID()}` }) },
  });
  const body = await response.text();
  expect(response.ok(), `${method} ${path}: ${body}`).toBe(true);
  return JSON.parse(body) as T;
}
function snapshot(page: Page, sceneId: string) {
  return api<TableSnapshot>(page, "GET", `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`);
}
async function login(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const cookies = await page.context().cookies(apiBaseUrl);
  expect(cookies.some((cookie) => cookie.name === "otte_session" || cookie.name === "__Host-otte_session")).toBe(true);
  await expect.poll(async () => (await snapshot(page, "scn_vault_entry")).user.id).toBe("usr_demo_gm");
}
async function openScene(page: Page, scene: Scene) {
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  const sceneTab = page.locator(".scene-tab").filter({ hasText: scene.name });
  await expect(sceneTab).toBeVisible();
  await sceneTab.click();
  const showScene = page.getByRole("button", { name: "Show scene", exact: true });
  if (await showScene.isVisible()) await showScene.click();
  const board = page.getByRole("group", { name: `${scene.name} interactive battle map`, exact: true });
  await expect(board).toBeVisible();
  return board;
}
function contentCounts(scene: Scene, table: TableSnapshot) {
  return {
    tokens: table.tokens.filter((token) => token.sceneId === scene.id).length,
    walls: scene.walls.length, lights: scene.lights.length, annotations: scene.annotations.length, fog: scene.fog.length,
    difficultTerrain: scene.difficultTerrain?.length ?? 0, coverOverrides: scene.coverOverrides?.length ?? 0,
  };
}
function sceneEvidence(scene: Scene, table: TableSnapshot) {
  return { id: scene.id, name: scene.name, width: scene.width, height: scene.height, backgroundAssetId: scene.backgroundAssetId ?? null, gridType: scene.gridType, gridOrigin: scene.gridOrigin, mapCalibrationComplete: scene.metadata.mapCalibrationComplete ?? false, contentCounts: contentCounts(scene, table) };
}

async function mapGeometry(board: Locator, shape: MapShape) {
  return board.evaluate((element, expected) => {
    const image = element.querySelector<HTMLImageElement>(".scene-map")!;
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    const scales = { x: box.width / image.naturalWidth, y: box.height / image.naturalHeight };
    const scale = style.objectFit === "cover" ? Math.max(scales.x, scales.y) : style.objectFit === "none" ? 1 : style.objectFit === "scale-down" ? Math.min(1, scales.x, scales.y) : Math.min(scales.x, scales.y);
    const width = style.objectFit === "fill" ? box.width : image.naturalWidth * scale;
    const height = style.objectFit === "fill" ? box.height : image.naturalHeight * scale;
    const position = style.objectPosition.split(" ");
    const offset = (value: string | undefined, space: number) => value?.endsWith("%") ? space * parseFloat(value) / 100 : parseFloat(value ?? "0") || 0;
    const bitmap = { left: box.left + offset(position[0], box.width - width), top: box.top + offset(position[1], box.height - height), width, height };
    const imageBox = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    const intersect = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
    const area = (bounds: { left: number; top: number; right: number; bottom: number }) => Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
    const nativeBounds = { ...bitmap, right: bitmap.left + width, bottom: bitmap.top + height };
    const renderedBounds = intersect(nativeBounds, imageBox);
    let viewportBounds = intersect(renderedBounds, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    for (let ancestor = image.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const overflow = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(overflow.overflowX)) {
        viewportBounds.left = Math.max(viewportBounds.left, bounds.left + ancestor.clientLeft);
        viewportBounds.right = Math.min(viewportBounds.right, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
      }
      if (/(auto|scroll|hidden|clip)/.test(overflow.overflowY)) {
        viewportBounds.top = Math.max(viewportBounds.top, bounds.top + ancestor.clientTop);
        viewportBounds.bottom = Math.min(viewportBounds.bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
      }
    }
    const points = [
      { name: "top-left red", x: 24, y: 24 }, { name: "top-right yellow", x: expected.width - 24, y: 24 },
      { name: "bottom-left green", x: 24, y: expected.height - 24 }, { name: "bottom-right blue", x: expected.width - 24, y: expected.height - 24 },
      { name: "native top border", x: expected.width / 2, y: 4 }, { name: "native bottom border", x: expected.width / 2, y: expected.height - 4 },
      { name: "native left border", x: 4, y: expected.height / 2 }, { name: "native right border", x: expected.width - 4, y: expected.height / 2 },
    ];
    return {
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, objectFit: style.objectFit, objectPosition: style.objectPosition,
      imageBox: { ...imageBox, width: box.width, height: box.height }, renderedBitmap: bitmap,
      rendererSourceVisibleFraction: area(renderedBounds) / (width * height),
      viewportSourceVisibleFraction: area(viewportBounds) / (width * height), viewportClip: viewportBounds,
      landmarks: points.map((point) => {
        const x = bitmap.left + point.x / expected.width * width, y = bitmap.top + point.y / expected.height * height;
        const within = (bounds: { left: number; top: number; right: number; bottom: number }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
        const topmost = document.elementFromPoint(x, y);
        const unobscured = Boolean(topmost && element.contains(topmost));
        return { ...point, screenX: x, screenY: y, insideRenderer: within(renderedBounds), insideViewport: within(viewportBounds), unobscured, occludingElement: topmost && !unobscured ? `${topmost.tagName}.${topmost.getAttribute("class") ?? ""}` : null };
      }),
    };
  }, shape);
}
type Geometry = Awaited<ReturnType<typeof mapGeometry>>;
function nativeEdgesVisible(geometry: Geometry) {
  return geometry.viewportSourceVisibleFraction > 0.98 && geometry.landmarks.every((point) => point.insideRenderer && point.insideViewport && point.unobscured);
}
function assertRenderer(geometry: Geometry, shape: MapShape) {
  expect([geometry.naturalWidth, geometry.naturalHeight]).toEqual([shape.width, shape.height]);
  expect(geometry.objectFit).toBe("contain");
  expect(geometry.renderedBitmap.width / geometry.renderedBitmap.height).toBeCloseTo(shape.width / shape.height, 3);
  expect(geometry.imageBox.width / geometry.imageBox.height).toBeCloseTo(shape.width / shape.height, 2);
  expect(geometry.rendererSourceVisibleFraction, "The renderer must preserve the complete native image independently of floating controls").toBeGreaterThan(0.999);
}

test.beforeAll(() => mkdirSync(artifactDir, { recursive: true }));
for (const shape of shapes) {
  test(`competitive ${shape.name} map upload preserves native dimensions and exposes all native edges after recorded view adjustments`, async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    const campaign = await api<Campaign>(page, "GET", `/api/v1/campaigns/${campaignId}`);
    const sceneInput = { name: `${shape.name} native edges ${Date.now().toString(36)}`, width: 300, height: 240, gridType: "square", gridSize: 50, active: true, metadata: { gridOverlayVisible: false } } satisfies Partial<Scene>;
    const created = await api<Scene>(page, "POST", `/api/v1/campaigns/${campaignId}/scenes`, { ...sceneInput, expectedUpdatedAt: campaign.updatedAt });
    const before = await snapshot(page, created.id);
    const emptyContent = { tokens: 0, walls: 0, lights: 0, annotations: 0, fog: 0, difficultTerrain: 0, coverOverrides: 0 };
    expect(contentCounts(created, before)).toEqual(emptyContent);
    expect(created.backgroundAssetId).toBeFalsy();
    let board = await openScene(page, created);
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("region", { name: "Manage workspace panel" }).locator(".manage-category-button", { hasText: "Scenes" }).click();
    await expect(page.getByRole("form", { name: `Edit scene ${created.name}`, exact: true })).toBeVisible();
    const fixturePath = resolve("tests/e2e/fixtures", shape.filename);
    await page.locator("#map-upload-file").setInputFiles(fixturePath);
    const calibration = page.locator(".grid-calibration-panel");
    await expect(calibration.getByRole("heading", { name: "Match the map grid" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: `Place ${shape.filename}`, exact: true })).toHaveCount(0);
    await calibration.getByRole("button", { name: "Close grid calibration", exact: true }).click();
    await expect(calibration).toBeHidden();
    const uploaded = await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`);
    const after = await snapshot(page, created.id);
    expect(uploaded).toMatchObject({ width: shape.width, height: shape.height, gridOrigin: { x: 0, y: 0 }, metadata: { mapCalibrationComplete: false } });
    expect(uploaded.backgroundAssetId).toBeTruthy();
    expect(contentCounts(uploaded, after)).toEqual(emptyContent);
    await expect.poll(() => board.locator(".scene-map").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(shape.width);

    const evidence = {
      status: "uploaded", shape, fixtureSha256: createHash("sha256").update(readFileSync(fixturePath)).digest("hex"), viewport: page.viewportSize(),
      calibrationApplied: false, workflow: ["Upload to a newly created blank scene", "Close grid calibration without applying it; this case checks native shape and edges only"],
      interpretation: "Renderer crop, viewport clipping, and control occlusion are measured separately. Unobscured edges are asserted only after any listed normal view adjustments.",
      createdScene: sceneEvidence(created, before), uploadedScene: sceneEvidence(uploaded, after),
      reloadedScene: null as ReturnType<typeof sceneEvidence> | null,
      interventions: [] as Array<{ phase: string; action: string; zoomBefore?: string | null; zoomAfter?: string | null }>,
      stages: [] as Array<{ phase: string; screenshot: string; zoom: string | null; inspectorOpen: boolean; geometry: Geometry }>,
    };
    const save = () => writeFileSync(resolve(artifactDir, `${shape.name}-metrics.json`), JSON.stringify(evidence, null, 2));
    async function capture(phase: string) {
      // Notifications are transient and are not view controls: let them expire so that only
      // persistent chrome (dock, palette, inspector) can count as covering a map landmark.
      await expect(page.locator(".toast")).toHaveCount(0, { timeout: 15_000 });
      await board.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      const geometry = await mapGeometry(board, shape);
      const screenshot = `${shape.name}-${phase}.png`;
      await page.screenshot({ path: resolve(artifactDir, screenshot), fullPage: true });
      evidence.stages.push({ phase, screenshot, zoom: await page.getByRole("button", { name: /Reset battle map zoom from/ }).getAttribute("aria-label"), inspectorOpen: await page.getByRole("button", { name: "Hide inspector", exact: true }).isVisible(), geometry });
      evidence.status = phase;
      save();
      return geometry;
    }
    async function exposeEdges(phase: string, geometry: Geometry) {
      const hideInspector = page.getByRole("button", { name: "Hide inspector", exact: true });
      if (!nativeEdgesVisible(geometry) && await hideInspector.isVisible()) {
        await hideInspector.click();
        await expect(page.getByRole("button", { name: "Show inspector", exact: true })).toBeVisible();
        evidence.interventions.push({ phase, action: "Hide inspector" });
        geometry = await capture(`${phase}-inspector-hidden`);
      }
      const zoomOut = page.getByRole("button", { name: "Zoom battle map out", exact: true });
      for (let step = 1; !nativeEdgesVisible(geometry) && step <= 3 && await zoomOut.isEnabled(); step += 1) {
        const zoom = page.getByRole("button", { name: /Reset battle map zoom from/ });
        const zoomBefore = await zoom.getAttribute("aria-label");
        await zoomOut.click();
        await expect(zoom).not.toHaveAttribute("aria-label", zoomBefore!);
        evidence.interventions.push({ phase, action: "Zoom battle map out", zoomBefore, zoomAfter: await zoom.getAttribute("aria-label") });
        geometry = await capture(`${phase}-zoom-out-${step}`);
      }
      assertRenderer(geometry, shape);
      expect(nativeEdgesVisible(geometry), "All authored corners and native border landmarks must be visible and uncovered after the recorded view adjustments").toBe(true);
    }
    const observedDefault = await capture("observed-default-controls");
    assertRenderer(observedDefault, shape);
    await exposeEdges("uploaded", observedDefault);
    board = await openScene(page, created);
    const reloaded = await api<Scene>(page, "GET", `/api/v1/scenes/${created.id}`);
    const reloadedTable = await snapshot(page, created.id);
    expect(reloaded).toMatchObject({ width: shape.width, height: shape.height, backgroundAssetId: uploaded.backgroundAssetId, gridOrigin: { x: 0, y: 0 } });
    expect(contentCounts(reloaded, reloadedTable)).toEqual(emptyContent);
    evidence.reloadedScene = sceneEvidence(reloaded, reloadedTable);
    await expect.poll(() => board.locator(".scene-map").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(shape.width);
    await exposeEdges("reloaded", await capture("reloaded-observed-controls"));
    evidence.status = "passed";
    save();
  });
}
