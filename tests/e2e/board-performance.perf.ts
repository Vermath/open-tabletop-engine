import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Builds a large scene and records frame intervals while dragging a token,
 * panning, zooming and moving a token by keyboard. Run with `pnpm perf:board`.
 *
 * The numbers describe main-thread and compositor work in the browser that ran
 * the test. Headless Chrome rasterises in software, so absolute values are
 * pessimistic for a machine with a GPU; compare runs made the same way.
 */
const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const sceneId = "scn_vault_entry";
const demoGmEmail = "gm@example.test";
const fixture = {
  width: Number(process.env.OTTE_PERF_MAP_WIDTH ?? 4096),
  height: Number(process.env.OTTE_PERF_MAP_HEIGHT ?? 3072),
  walls: Number(process.env.OTTE_PERF_WALLS ?? 300),
  lights: Number(process.env.OTTE_PERF_LIGHTS ?? 12),
  tokens: Number(process.env.OTTE_PERF_TOKENS ?? 50),
};
const outputPath = resolve(process.env.OTTE_PERF_OUTPUT ?? "output/board-performance/latest.json");

interface FrameStats { frames: number; p50: number; p95: number; max: number; over33: number; longTaskMs: number; canvasDraws: number; canvasDrawMs: number; mainThreadMs?: Record<string, number> }

interface TraceEvent { name: string; ph: string; pid: number; tid: number; dur?: number; args?: { name?: string } }

/**
 * With OTTE_PERF_TRACE=1, records a browser trace around the action and sums
 * the time of the largest renderer main-thread events by name. Events nest, so
 * the figures overlap; they show where the time goes, not a total.
 */
async function traceMainThread(page: Page, action: () => Promise<void>): Promise<Record<string, number> | undefined> {
  if (process.env.OTTE_PERF_TRACE !== "1") { await action(); return undefined; }
  const session = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  session.on("Tracing.dataCollected", (payload) => { events.push(...(payload.value as unknown as TraceEvent[])); });
  await session.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "blink", "__metadata"] } });
  await action();
  const complete = new Promise<void>((done) => { session.once("Tracing.tracingComplete", () => done()); });
  await session.send("Tracing.end");
  await complete;
  await session.detach();
  const mainThreads = new Set(events.filter((event) => event.ph === "M" && event.name === "thread_name" && event.args?.name === "CrRendererMain").map((event) => `${event.pid}:${event.tid}`));
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.ph !== "X" || !event.dur || !mainThreads.has(`${event.pid}:${event.tid}`)) continue;
    totals.set(event.name, (totals.get(event.name) ?? 0) + event.dur / 1000);
  }
  return Object.fromEntries([...totals].sort((left, right) => right[1] - left[1]).slice(0, 16).map(([name, ms]) => [name, Math.round(ms)]));
}

/** Draw count and cumulative draw time the canvas renderer records on its map canvas; zero for the DOM renderer. */
async function canvasDrawStats(page: Page) {
  return page.evaluate(() => {
    const stats = document.querySelector<HTMLCanvasElement>(".board-map-canvas")?.dataset;
    return { draws: Number(stats?.drawCount ?? 0), ms: Number(stats?.drawMs ?? 0) };
  });
}

async function buildFixture(page: Page) {
  return page.evaluate(async ({ apiBaseUrl, sceneId, fixture }) => {
    const call = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
      if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
      return response.json();
    };
    const json = (body: unknown, key: string): RequestInit => ({ method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
    const scene = () => call(`/api/v1/scenes/${sceneId}`) as Promise<{ updatedAt: string }>;

    // A map with enough detail that it cannot be drawn as a flat colour.
    const canvas = new OffscreenCanvas(fixture.width, fixture.height);
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, fixture.width, fixture.height);
    gradient.addColorStop(0, "#3d4a3a"); gradient.addColorStop(0.5, "#6b5a40"); gradient.addColorStop(1, "#2c3440");
    context.fillStyle = gradient;
    context.fillRect(0, 0, fixture.width, fixture.height);
    for (let index = 0; index < 4000; index += 1) {
      context.fillStyle = `hsl(${(index * 47) % 360} 30% ${30 + (index % 40)}% / 0.5)`;
      context.fillRect((index * 613) % fixture.width, (index * 977) % fixture.height, 40 + (index % 90), 40 + (index % 70));
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });

    const before = await scene();
    await call(`/api/v1/campaigns/camp_demo/assets/upload?sceneId=${sceneId}&setAsBackground=true&expectedSceneUpdatedAt=${encodeURIComponent(before.updatedAt)}`, {
      method: "POST", headers: { "content-type": "image/png", "x-asset-name": encodeURIComponent("perf-map.png"), "idempotency-key": `perf-map-${before.updatedAt}` }, body: blob,
    });
    const sized = await scene();
    await call(`/api/v1/scenes/${sceneId}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": `perf-size-${sized.updatedAt}` }, body: JSON.stringify({ width: fixture.width, height: fixture.height, gridSize: 64, expectedUpdatedAt: sized.updatedAt }) });

    const columns = Math.ceil(Math.sqrt(fixture.walls));
    for (let index = 0; index < fixture.walls; index += 1) {
      const x = 120 + (index % columns) * ((fixture.width - 240) / columns);
      const y = 120 + Math.floor(index / columns) * ((fixture.height - 240) / columns);
      const revision = (await scene()).updatedAt;
      await call(`/api/v1/scenes/${sceneId}/walls`, json({ ...(index % 2 === 0 ? { x1: x, y1: y, x2: x + 150, y2: y } : { x1: x, y1: y, x2: x, y2: y + 150 }), expectedUpdatedAt: revision }, `perf-wall-${index}-${revision}`));
    }
    for (let index = 0; index < fixture.lights; index += 1) {
      const revision = (await scene()).updatedAt;
      await call(`/api/v1/scenes/${sceneId}/lights`, json({ x: 300 + (index % 4) * (fixture.width / 4), y: 300 + Math.floor(index / 4) * (fixture.height / 3), radius: 420, color: "#ffd27a", expectedUpdatedAt: revision }, `perf-light-${index}-${revision}`));
    }
    const existing = await call(`/api/v1/scenes/${sceneId}/tokens`) as unknown[];
    for (let index = existing.length; index < fixture.tokens; index += 1) {
      const current = await scene();
      await call(`/api/v1/scenes/${sceneId}/tokens`, json({ name: `Perf ${index}`, x: 500 + (index % 10) * 300, y: 500 + Math.floor(index / 10) * 400, width: 64, height: 64, hidden: false, locked: false, disposition: "neutral", ownerUserIds: [], expectedUpdatedAt: current.updatedAt }, `perf-token-${index}-${current.updatedAt}`));
    }
    const final = await call(`/api/v1/scenes/${sceneId}`) as { walls: unknown[]; lights: unknown[]; width: number; height: number };
    const tokens = await call(`/api/v1/scenes/${sceneId}/tokens`) as unknown[];
    return { width: final.width, height: final.height, walls: final.walls.length, lights: final.lights.length, tokens: tokens.length };
  }, { apiBaseUrl, sceneId, fixture });
}

async function measure(page: Page, action: () => Promise<void>): Promise<FrameStats> {
  const drawsBefore = await canvasDrawStats(page);
  await page.evaluate(() => {
    const state = { frames: [] as number[], longTasks: [] as number[], running: true, last: performance.now(), observer: undefined as PerformanceObserver | undefined };
    const tick = (now: number) => { state.frames.push(now - state.last); state.last = now; if (state.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    state.observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) state.longTasks.push(entry.duration); });
    state.observer.observe({ entryTypes: ["longtask"] });
    (window as unknown as { __boardPerf: typeof state }).__boardPerf = state;
  });
  const mainThreadMs = await traceMainThread(page, action);
  await page.waitForTimeout(150);
  const drawsAfter = await canvasDrawStats(page);
  const frames = await page.evaluate(() => {
    const state = (window as unknown as { __boardPerf: { frames: number[]; longTasks: number[]; running: boolean; observer?: PerformanceObserver } }).__boardPerf;
    state.running = false;
    state.observer?.disconnect();
    const frames = state.frames.slice(1).sort((left, right) => left - right);
    const at = (fraction: number) => Number((frames[Math.min(frames.length - 1, Math.floor(frames.length * fraction))] ?? 0).toFixed(1));
    return { frames: frames.length, p50: at(0.5), p95: at(0.95), max: at(1), over33: frames.filter((frame) => frame > 33.4).length, longTaskMs: Math.round(state.longTasks.reduce((sum, value) => sum + value, 0)) };
  });
  return { ...frames, canvasDraws: drawsAfter.draws - drawsBefore.draws, canvasDrawMs: Math.round(drawsAfter.ms - drawsBefore.ms), ...(mainThreadMs ? { mainThreadMs } : {}) };
}

test("board frame times on a large scene", async ({ page }) => {
  // OTTE_PERF_RENDERER=dom measures the original DOM map and light elements for comparison.
  const renderer = process.env.OTTE_PERF_RENDERER === "dom" ? "dom" : "canvas";
  await page.addInitScript((value) => {
    if (value === "dom") window.localStorage.setItem("otte:boardRenderer", "dom");
  }, renderer);
  // The production build has no demo sign-in buttons, so sign the seeded GM in through the API.
  await page.goto("/");
  await page.evaluate(async ({ apiBaseUrl, email }) => {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (!response.ok) throw new Error(`demo sign-in failed: ${response.status} ${await response.text()}`);
    const login = await response.json() as { user: { id: string } };
    localStorage.setItem("otte:userId", login.user.id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, { apiBaseUrl, email: demoGmEmail });
  await page.reload();
  await expect(page.locator(".scene-board")).toBeVisible();
  const built = await buildFixture(page);
  expect(built.walls).toBeGreaterThanOrEqual(fixture.walls);
  expect(built.tokens).toBeGreaterThanOrEqual(fixture.tokens);

  await page.reload();
  const board = page.locator(".scene-board");
  await expect(board).toBeVisible();
  await expect.poll(() => page.locator(".scene-board button.token").count()).toBeGreaterThanOrEqual(fixture.tokens);
  await page.waitForTimeout(1500);

  const viewport = (await page.locator(".scene-viewport").boundingBox())!;
  const centre = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  const results: Record<string, FrameStats> = {};

  // Zoom in so the map overflows the view, as it does in play.
  await page.mouse.move(centre.x, centre.y);
  results.wheelZoom = await measure(page, async () => {
    for (let step = 0; step < 14; step += 1) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  });

  results.pan = await measure(page, async () => {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: "right" });
    for (let step = 1; step <= 60; step += 1) { await page.mouse.move(centre.x - step * 5, centre.y - step * 3); await page.waitForTimeout(16); }
    await page.mouse.up({ button: "right" });
  });

  // Bring a fixture token to the middle of the view and drag it.
  const dragged = page.getByRole("button", { name: /token Perf 25$/ });
  await dragged.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(300);
  const grip = await dragged.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && element.contains(hit) ? point : null;
  });
  expect(grip, "a token should be draggable inside the view").not.toBeNull();
  results.tokenDrag = await measure(page, async () => {
    await page.mouse.move(grip!.x, grip!.y);
    await page.mouse.down();
    for (let step = 1; step <= 60; step += 1) { await page.mouse.move(grip!.x + step * 4, grip!.y + step * 2); await page.waitForTimeout(16); }
    await page.mouse.up();
  });

  const movable = page.locator(".scene-board button.token").first();
  await movable.focus();
  results.keyboardMove = await measure(page, async () => {
    for (let step = 0; step < 10; step += 1) { await page.keyboard.press(step % 2 === 0 ? "ArrowRight" : "ArrowLeft"); await page.waitForTimeout(250); }
  });

  const domNodes = await board.evaluate((element) => element.querySelectorAll("*").length);
  const report = {
    recordedAt: new Date().toISOString(),
    browser: test.info().project.use.channel ?? "chromium",
    viewport: test.info().project.use.viewport,
    renderer: await board.getAttribute("data-map-renderer"),
    fixture: built,
    boardDomNodes: domNodes,
    frameIntervalMs: results,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`BOARD_PERF ${JSON.stringify(report)}`);
});
