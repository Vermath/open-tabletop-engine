import {
  expect,
  test,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Response,
} from "@playwright/test";
import type {
  AuditLog,
  ChatMessage,
  Token,
} from "../../packages/core/src/index.js";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import {
  installMultiplayerDiagnostics,
  browserHardwareInformation,
  computedPanFilters,
  panFilterSelectors,
  rendererMemory,
  type MultiplayerDiagnostics,
} from "./multiplayer-profiling.js";

const apiPort = Number(process.env.OTTE_MULTIPLAYER_API_PORT ?? 4230);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${process.env.OTTE_MULTIPLAYER_WEB_PORT ?? 5304}`;
const controlUrl = `http://127.0.0.1:${process.env.OTTE_MULTIPLAYER_CONTROL_PORT ?? 6230}`;
const sceneId = "scn_vault_entry";
const panExperiment = process.env.OTTE_MULTIPLAYER_PAN_EXPERIMENT === "1";
const serverProfiling = process.env.OTTE_MULTIPLAYER_SERVER_PROFILE === "1";
const profiling =
  process.env.OTTE_MULTIPLAYER_PROFILE === "1" ||
  panExperiment ||
  serverProfiling;
const profileClient = serverProfiling ? 0 : 5;
const rendererProfileName = serverProfiling
  ? "gm-client-1"
  : "receiving-client-6";
const durationMs = Number(
  process.env.OTTE_MULTIPLAYER_DURATION_MS ?? (profiling ? 30_000 : 180_000),
);
if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 900_000)
  throw new Error(
    "OTTE_MULTIPLAYER_DURATION_MS must be between 1000 and 900000",
  );
const minimumRounds = durationMs < 180_000 ? 1 : 3;
const authHeaders = {
  authorization: "Bearer otte-cookie-session",
  Origin: webUrl,
};

type Observation = {
  kind: "chat" | "token";
  value: string;
  previousLeft?: string;
  seenAt?: number;
};
type FrameSample = {
  startEpochMs: number;
  endEpochMs: number;
  intervalMs: number;
};
type PointerSample = {
  kind: "pan" | "token_drag";
  startedAt?: number;
  endedAt?: number;
  pointerMoves: number;
};
type Probe = {
  sockets: WebSocket[];
  collectFrames: boolean;
  frames: FrameSample[];
  visibilityStates: string[];
  focusStates: boolean[];
  starts: Record<string, number>;
  observations: Record<string, Observation>;
  armed?: { id: string; selector: string; key: string };
  pointer?: PointerSample;
};
declare global {
  interface Window {
    __multiplayerProbe: Probe;
  }
}

type Client = {
  index: number;
  context: BrowserContext;
  page: Page;
  websocketCloses: number;
};
type Command = {
  sender: number;
  kind: "chat" | "token";
  key: string;
  method: string;
  url: string;
  body: unknown;
  result: unknown;
  acknowledged: boolean;
};
type Measurement = {
  id: string;
  kind: "chat" | "token";
  sender: number;
  actionAt: number;
  observations: Array<{ client: number; latencyMs: number }>;
};

function quantiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number) =>
    sorted.length
      ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]
      : null;
  return {
    count: sorted.length,
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}

function tokenButton(page: Page, index: number) {
  return page.getByRole("button", {
    name: `Player Objects & Tokens token Load token ${index}`,
    exact: true,
  });
}

async function ready(client: Client) {
  await expect(
    client.page.getByLabel("Current campaign", { exact: true }),
  ).toHaveText("The Ember Vault");
  await expect(client.page.locator(".session-pulse")).toHaveAttribute(
    "data-connection-state",
    "connected",
    { timeout: 60_000 },
  );
  await expect(tokenButton(client.page, client.index)).toBeVisible();
}

async function recordCommand(
  response: Response,
  sender: number,
  kind: Command["kind"],
): Promise<Command> {
  expect(response.ok(), await response.text()).toBe(true);
  const request = response.request();
  const key = await request.headerValue("idempotency-key");
  expect(key, "UI mutations carry a stable command identity").toBeTruthy();
  return {
    sender,
    kind,
    key: key!,
    method: request.method(),
    url: request.url(),
    body: request.postDataJSON(),
    result: (await response.json()) as unknown,
    acknowledged: true,
  };
}

async function browserGet<T>(client: Client, path: string): Promise<T> {
  const response = await client.page.request.get(`${apiUrl}${path}`, {
    headers: authHeaders,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function arm(
  clients: Client[],
  sender: Client,
  id: string,
  kind: Observation["kind"],
  value: string,
  key = kind === "chat" ? "Enter" : "ArrowRight",
) {
  await Promise.all(
    clients.map(({ page }) =>
      page.evaluate(
        ({ id, kind, value }) => {
          const element =
            kind === "token"
              ? document.querySelector<HTMLElement>(
                  `button.token[aria-label="${value}"]`,
                )
              : undefined;
          // Actions are sequential; retain only the active observation so
          // probe work per frame does not grow with the session duration.
          window.__multiplayerProbe.observations = {
            [id]: { kind, value, previousLeft: element?.style.left },
          };
        },
        { id, kind, value },
      ),
    ),
  );
  await sender.page.evaluate(
    ({ id, kind, key }) => {
      window.__multiplayerProbe.armed = {
        id,
        key,
        selector:
          kind === "chat"
            ? 'textarea[aria-label="Chat message"]'
            : "button.token",
      };
    },
    { id, kind, key },
  );
}

async function finishMeasurement(
  clients: Client[],
  sender: Client,
  id: string,
  kind: Measurement["kind"],
): Promise<Measurement> {
  const observations = await Promise.all(
    clients.map(async ({ index, page }) => {
      await page.waitForFunction(
        (id) =>
          window.__multiplayerProbe.observations[id]?.seenAt !== undefined,
        id,
        { timeout: 15_000 },
      );
      return {
        client: index,
        seenAt: await page.evaluate(
          (id) => window.__multiplayerProbe.observations[id]!.seenAt!,
          id,
        ),
      };
    }),
  );
  const actionAt = await sender.page.evaluate(
    (id) => window.__multiplayerProbe.starts[id],
    id,
  );
  expect(actionAt).toBeDefined();
  const result = {
    id,
    kind,
    sender: sender.index,
    actionAt: actionAt!,
    observations: observations.map(({ client, seenAt }) => ({
      client,
      latencyMs: seenAt - actionAt!,
    })),
  };
  for (const observation of result.observations)
    expect(
      observation.latencyMs,
      "browser performance epochs must agree",
    ).toBeGreaterThanOrEqual(0);
  return result;
}

test("six real browser clients retain acknowledged writes and deduplicate retries across reconnect and API crash", async ({
  browser,
}, testInfo) => {
  test.setTimeout(durationMs + 420_000);
  const controlKey = process.env.OTTE_MULTIPLAYER_CONTROL_KEY;
  expect(
    controlKey,
    "Run only with playwright.multiplayer.config.ts",
  ).toBeTruthy();
  const fixture = JSON.parse(
    readFileSync(
      resolve("storage", `e2e-multiplayer-${apiPort}`, "fixture.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const clients: Client[] = [];
  const commands: Command[] = [];
  const measurements: Measurement[] = [];
  const frameSamples: Array<{
    client: number;
    intervals: FrameSample[];
    visibilityStates: string[];
    focusStates: boolean[];
  }> = [];
  const phases: Array<{ name: string; completedAt: string; detail?: unknown }> =
    [];
  const browserErrors: Array<{ client: number; message: string }> = [];
  const startup: Array<Record<string, unknown>> = [];
  const panExperimentSamples: Array<Record<string, unknown>> = [];
  const panDiagnostics: Array<Record<string, unknown>> = [];
  let gpuInformation: unknown;
  const browserEnvironment: Array<{
    phase: string;
    info: Awaited<ReturnType<typeof browserHardwareInformation>>;
  }> = [];
  const captureBrowserEnvironment = async (phase: string) => {
    const info = await browserHardwareInformation(browser);
    browserEnvironment.push({ phase, info });
    if (phase === "six_clients_ready_before_workload")
      gpuInformation = "systemInfo" in info ? info.systemInfo : info;
  };
  const pointerGestures: Array<
    PointerSample & {
      intervals: FrameSample[];
      visibilityStates: string[];
      focusStates: boolean[];
      before: unknown;
      after: unknown;
    }
  > = [];
  const memory: Array<{
    phase: string;
    clients: Array<{
      client: number;
      measurement: Awaited<ReturnType<typeof rendererMemory>>;
    }>;
  }> = [];
  let apiProfileStarted = false;
  let apiProfileResult: unknown;
  const apiProfileErrors: string[] = [];
  const stopApiProfile = async () => {
    if (!apiProfileStarted) return;
    apiProfileStarted = false;
    const response = await clients[0]!.page.request.post(
      `${controlUrl}/profile/stop`,
      { headers: { "x-fixture-control-key": controlKey! } },
    );
    expect(response.ok(), await response.text()).toBe(true);
    apiProfileResult = await response.json();
    for (const name of ["api-child.cpuprofile", "api-timing.json"]) {
      const path = testInfo.outputPath(name);
      copyFileSync(
        resolve("storage", `e2e-multiplayer-${apiPort}`, name),
        path,
      );
      await testInfo.attach(name, { path, contentType: "application/json" });
    }
  };
  let profiler: CDPSession | undefined;
  let cpuProfile: unknown;
  let profileStartedAt: number | undefined;
  let profileStoppedAt: number | undefined;
  const profileMetrics: Array<{
    phase: string;
    metrics: Array<{ name: string; value: number }>;
  }> = [];
  const stopRendererProfile = async () => {
    if (!profiler) return;
    const activeProfiler = profiler;
    profiler = undefined;
    try {
      cpuProfile = (await activeProfiler.send("Profiler.stop")).profile;
      profileStoppedAt = Date.now();
      profileMetrics.push({
        phase: "after",
        ...(await activeProfiler.send("Performance.getMetrics")),
      });
    } finally {
      await activeProfiler.detach();
    }
  };
  const captureMemory = async (phase: string) => {
    const samples = [];
    for (const client of clients)
      samples.push({
        client: client.index,
        measurement: await rendererMemory(client.page),
      });
    memory.push({ phase, clients: samples });
  };
  const metadata = {
    sourceSha256: process.env.OTTE_MULTIPLAYER_SOURCE_SHA256 ?? null,
    sourceManifest: process.env.OTTE_MULTIPLAYER_SOURCE_MANIFEST ?? null,
    browser: browser.version(),
    browserVersion: browser.version(),
    browserChannel: testInfo.project.use.channel ?? "bundled-chromium",
    profiling,
    serverProfiling,
    panExperiment,
    trace: testInfo.project.use.trace,
    headless: testInfo.project.use.headless !== false,
    backgroundTimerAndRendererThrottling:
      "disabled by dedicated Chromium launch arguments",
    platform: platform(),
    osRelease: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    node: process.version,
    viewport: { width: 1440, height: 1000 },
    clients: 6,
    requestedActivePlayMs: durationMs,
    actualActivePlayMs: 0,
    completedRounds: 0,
    mode: profiling
      ? "diagnostic_profile_not_acceptance"
      : durationMs < 180_000
        ? "harness_smoke_only"
        : "sustained_local_evidence",
  };
  const control = async (path: string, method: "GET" | "POST" = "POST") => {
    const result = await clients[0]!.page.request.fetch(
      `${controlUrl}${path}`,
      { method, headers: { "x-fixture-control-key": controlKey! } },
    );
    expect(result.ok(), await result.text()).toBe(true);
    return (await result.json()) as {
      generation: number;
      pid: number;
      running: boolean;
    };
  };
  const checkpoint = (name: string, detail?: unknown) => {
    phases.push({ name, completedAt: new Date().toISOString(), detail });
    writeFileSync(
      testInfo.outputPath("multiplayer-progress.json"),
      JSON.stringify(
        {
          metadata,
          fixture,
          phases,
          commands: commands.map(({ body: _body, ...command }) => command),
          measurements,
        },
        null,
        2,
      ),
    );
  };
  try {
    for (let index = 0; index < 6; index += 1) {
      const context = await browser.newContext({
        baseURL: webUrl,
        viewport: metadata.viewport,
      });
      if (profiling) await context.addInitScript(installMultiplayerDiagnostics);
      await context.addInitScript(() => {
        const probe: Probe = {
          sockets: [],
          collectFrames: false,
          frames: [],
          visibilityStates: [],
          focusStates: [],
          starts: {},
          observations: {},
        };
        window.__multiplayerProbe = probe;
        // Preserve native transport for measurements; retain handles solely for
        // the explicit offline fault, since Chromium offline emulation leaves
        // already-connected WebSockets open.
        window.WebSocket = new Proxy(window.WebSocket, {
          construct(target, args) {
            const socket = Reflect.construct(target, args) as WebSocket;
            probe.sockets.push(socket);
            return socket;
          },
        });
        const epoch = () => performance.timeOrigin + performance.now();
        document.addEventListener(
          "keydown",
          (event) => {
            const armed = probe.armed;
            if (
              armed &&
              event.key === armed.key &&
              event.target instanceof Element &&
              event.target.matches(armed.selector)
            ) {
              probe.starts[armed.id] = epoch();
              probe.armed = undefined;
            }
          },
          true,
        );
        for (const type of ["pointerdown", "pointermove", "pointerup"] as const)
          document.addEventListener(
            type,
            () => {
              const pointer = probe.pointer;
              if (!pointer || pointer.endedAt !== undefined) return;
              if (type === "pointerdown") pointer.startedAt = epoch();
              if (type === "pointermove" && pointer.startedAt !== undefined)
                pointer.pointerMoves += 1;
              if (type === "pointerup") pointer.endedAt = epoch();
            },
            true,
          );
        const isVisible = (element: HTMLElement) => {
          if (
            !element.getClientRects().length ||
            getComputedStyle(element).visibility === "hidden"
          )
            return false;
          const bounds = element.getBoundingClientRect();
          let left = Math.max(0, bounds.left),
            right = Math.min(innerWidth, bounds.right);
          let top = Math.max(0, bounds.top),
            bottom = Math.min(innerHeight, bounds.bottom);
          for (
            let parent = element.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent),
              clip = parent.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
          return right > left && bottom > top;
        };
        let previous: number | undefined;
        const frame = (now: number) => {
          if (probe.collectFrames) {
            if (previous !== undefined && probe.frames.length < 100_000)
              probe.frames.push({
                startEpochMs: performance.timeOrigin + previous,
                endEpochMs: performance.timeOrigin + now,
                intervalMs: now - previous,
              });
            if (!probe.visibilityStates.includes(document.visibilityState))
              probe.visibilityStates.push(document.visibilityState);
            if (!probe.focusStates.includes(document.hasFocus()))
              probe.focusStates.push(document.hasFocus());
            previous = now;
          } else previous = undefined;
          for (const observation of Object.values(probe.observations)) {
            if (observation.seenAt !== undefined) continue;
            const elements =
              observation.kind === "chat"
                ? [
                    ...document.querySelectorAll<HTMLElement>(".chat-body"),
                  ].filter(
                    (element) => element.textContent === observation.value,
                  )
                : [
                    ...document.querySelectorAll<HTMLElement>("button.token"),
                  ].filter(
                    (element) =>
                      element.getAttribute("aria-label") ===
                        observation.value &&
                      element.style.left !== observation.previousLeft,
                  );
            if (elements.some(isVisible)) observation.seenAt = epoch();
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const page = await context.newPage();
      const client = { index, context, page, websocketCloses: 0 };
      page.on("pageerror", (error) =>
        browserErrors.push({ client: index, message: error.message }),
      );
      page.on("websocket", (socket) =>
        socket.on("close", () => {
          client.websocketCloses += 1;
        }),
      );
      clients.push(client);
      const navigationStartedAt = Date.now();
      await page.goto("/");
      await page
        .getByLabel("Login email", { exact: true })
        .fill(`load${index}@example.test`);
      await page
        .getByLabel("Login password", { exact: true })
        .fill("Multiplayer-fixture-2026!");
      const loginStartedAt = Date.now();
      await page.getByLabel("Login password", { exact: true }).press("Enter");
      await ready(client);
      await page.locator("#inspector-tab-chat").click();
      await expect(
        page.getByRole("textbox", { name: "Chat message", exact: true }),
      ).toBeVisible();
      const session = await browserGet<{ user: { id: string } }>(
        client,
        "/api/v1/auth/session",
      );
      expect(session.user.id).toBe(
        index === 0 ? "usr_demo_gm" : `usr_load_player_${index}`,
      );
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              [...document.images].some(
                (image) =>
                  image.complete &&
                  image.naturalWidth === 4096 &&
                  image.naturalHeight === 3072,
              ),
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      await page.evaluate(async () => {
        const map = [...document.images].find(
          (image) =>
            image.naturalWidth === 4096 && image.naturalHeight === 3072,
        );
        if (!map) throw new Error("Fixture map image missing before decode");
        await map.decode();
      });
      const mapReadyAt = Date.now();
      startup.push({
        client: index,
        navigationStartedAt,
        loginStartedAt,
        mapReadyAt,
        navigationToMapReadyMs: mapReadyAt - navigationStartedAt,
        loginToMapReadyMs: mapReadyAt - loginStartedAt,
        browser: await page.evaluate(() => ({
          navigation: performance
            .getEntriesByType("navigation")
            .map((entry) => entry.toJSON()),
          renderedChatMessages: document.querySelectorAll(
            '[aria-label="Chat messages"] article.chat-message',
          ).length,
          renderedChatBodies: document.querySelectorAll(".chat-body").length,
          renderedTokens: document.querySelectorAll("button.token").length,
        })),
      });
      if (index === 0) {
        const gmSnapshot = JSON.stringify(
          await browserGet(
            client,
            `/api/v1/campaigns/camp_demo/snapshot?sceneId=${sceneId}`,
          ),
        );
        expect(gmSnapshot).toContain("Private ambush plan");
        expect(gmSnapshot).toContain("Private ambush sentinel");
      }
      if (index > 0) {
        await expect(
          page.getByRole("button", { name: /Private ambush sentinel/ }),
        ).toHaveCount(0);
        expect(
          JSON.stringify(
            await browserGet(
              client,
              `/api/v1/campaigns/camp_demo/snapshot?sceneId=${sceneId}`,
            ),
          ),
        ).not.toContain("Private ambush plan");
      }
    }
    checkpoint("six password-authenticated clients ready with decoded map");
    await captureBrowserEnvironment("six_clients_ready_before_workload");
    await captureMemory("six_clients_ready_before_workload");
    if (serverProfiling) {
      const response = await clients[0]!.page.request.post(
        `${controlUrl}/profile/start`,
        { headers: { "x-fixture-control-key": controlKey! } },
      );
      expect(response.ok(), await response.text()).toBe(true);
      apiProfileStarted = true;
    }
    if (profiling) {
      profiler = await clients[profileClient]!.context.newCDPSession(
        clients[profileClient]!.page,
      );
      await profiler.send("Performance.enable");
      profileMetrics.push({
        phase: "before",
        ...(await profiler.send("Performance.getMetrics")),
      });
      await profiler.send("Profiler.enable");
      await profiler.send("Profiler.setSamplingInterval", { interval: 1000 });
      profileStartedAt = Date.now();
      await profiler.send("Profiler.start");
    }
    await Promise.all(
      clients.map(({ page }) =>
        page.evaluate(() => {
          window.__multiplayerProbe.collectFrames = true;
        }),
      ),
    );
    const activePlayStartedAt = Date.now();
    for (
      let round = 0;
      round < minimumRounds || Date.now() - activePlayStartedAt < durationMs;
      round += 1
    ) {
      for (const sender of clients) {
        const chatId = `measured-chat-${round}-${sender.index}`;
        const body = `Multiplayer evidence ${chatId}`;
        await sender.page
          .getByRole("textbox", { name: "Chat message", exact: true })
          .fill(body);
        await arm(clients, sender, chatId, "chat", body);
        const chatResponse = sender.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/v1/chat/messages",
        );
        await sender.page
          .getByRole("textbox", { name: "Chat message", exact: true })
          .press("Enter");
        commands.push(
          await recordCommand(await chatResponse, sender.index, "chat"),
        );
        measurements.push(
          await finishMeasurement(clients, sender, chatId, "chat"),
        );
        const moveId = `measured-token-${round}-${sender.index}`;
        await arm(
          clients,
          sender,
          moveId,
          "token",
          `Player Objects & Tokens token Load token ${sender.index}`,
          round % 2 === 0 ? "ArrowRight" : "ArrowLeft",
        );
        const moveResponse = sender.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
              `/api/v1/scenes/${sceneId}/tokens/move`,
        );
        await tokenButton(sender.page, sender.index).press(
          round % 2 === 0 ? "ArrowRight" : "ArrowLeft",
        );
        commands.push(
          await recordCommand(await moveResponse, sender.index, "token"),
        );
        measurements.push(
          await finishMeasurement(clients, sender, moveId, "token"),
        );
        checkpoint(
          `measurement round ${round + 1} client ${sender.index + 1} complete`,
        );
      }
      metadata.completedRounds = round + 1;
    }
    metadata.actualActivePlayMs = Date.now() - activePlayStartedAt;
    if (serverProfiling) {
      await stopRendererProfile();
      await stopApiProfile();
    }
    const actionWindows = measurements.map((measurement) => ({
      start: measurement.actionAt,
      end:
        measurement.actionAt +
        Math.max(
          ...measurement.observations.map(
            (observation) => observation.latencyMs,
          ),
        ),
    }));
    for (const client of clients)
      frameSamples.push(
        await client.page.evaluate(
          ({ client, actionWindows }) => {
            const probe = window.__multiplayerProbe;
            probe.collectFrames = false;
            return {
              client,
              intervals: probe.frames.filter((frame) =>
                actionWindows.some(
                  (window) =>
                    frame.startEpochMs >= window.start &&
                    frame.endEpochMs <= window.end,
                ),
              ),
              visibilityStates: probe.visibilityStates,
              focusStates: probe.focusStates,
            };
          },
          { client: client.index, actionWindows },
        ),
      );
    expect(measurements.length).toBeGreaterThanOrEqual(minimumRounds * 12);
    expect(metadata.actualActivePlayMs).toBeGreaterThanOrEqual(durationMs);
    for (const sample of frameSamples)
      expect(sample.intervals.length).toBeGreaterThan(0);
    checkpoint("latency and animation-frame sampling complete");
    await stopRendererProfile();
    await captureMemory("after_sustained_chat_and_keyboard_workload");
    const pointerPage = clients[0]!.page;
    const viewport = pointerPage.getByRole("region", {
      name: "Multiplayer Vault battle map viewport",
      exact: true,
    });
    const board = pointerPage.getByRole("group", {
      name: "Multiplayer Vault interactive battle map",
      exact: true,
    });
    const pointerState = () =>
      pointerPage.evaluate(() => {
        const viewport =
          document.querySelector<HTMLElement>(".scene-viewport")!;
        const token = document.querySelector<HTMLElement>(
          'button.token[aria-label="Player Objects & Tokens token Load token 0"]',
        )!;
        return {
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
          scrollWidth: viewport.scrollWidth,
          scrollHeight: viewport.scrollHeight,
          clientWidth: viewport.clientWidth,
          clientHeight: viewport.clientHeight,
          tokenLeft: token.style.left,
          tokenTop: token.style.top,
        };
      });
    const gesture = async (
      kind: PointerSample["kind"],
      button: "left" | "middle",
      from: { x: number; y: number },
      to: { x: number; y: number },
      experimentVariant?: string,
    ) => {
      const before = await pointerState();
      await pointerPage.evaluate((kind) => {
        const probe = window.__multiplayerProbe;
        probe.pointer = { kind, pointerMoves: 0 };
        probe.frames = [];
        probe.visibilityStates = [];
        probe.focusStates = [];
        probe.collectFrames = true;
      }, kind);
      await pointerPage.mouse.move(from.x, from.y);
      await pointerPage.mouse.down({ button });
      await expect(board).toHaveClass(
        kind === "pan" ? /map-panning/ : /token-drag-active/,
      );
      const driverStartedAt = Date.now();
      while (Date.now() - driverStartedAt < 5_000) {
        const fraction = Math.min(1, (Date.now() - driverStartedAt) / 5_000);
        await pointerPage.mouse.move(
          from.x + (to.x - from.x) * fraction,
          from.y + (to.y - from.y) * fraction,
        );
        await pointerPage.waitForTimeout(16);
      }
      await pointerPage.mouse.move(to.x, to.y);
      await pointerPage.mouse.up({ button });
      const sample = await pointerPage.evaluate(() => {
        const probe = window.__multiplayerProbe;
        probe.collectFrames = false;
        const pointer = probe.pointer!;
        return {
          ...pointer,
          visibilityStates: [...probe.visibilityStates],
          focusStates: [...probe.focusStates],
          intervals: probe.frames.filter(
            (frame) =>
              frame.startEpochMs >= pointer.startedAt! &&
              frame.endEpochMs <= pointer.endedAt!,
          ),
        };
      });
      expect(sample.startedAt).toBeDefined();
      expect(sample.endedAt! - sample.startedAt!).toBeGreaterThanOrEqual(5_000);
      expect(sample.pointerMoves).toBeGreaterThan(10);
      expect(sample.intervals.length).toBeGreaterThan(10);
      const after = await pointerState();
      if (experimentVariant)
        panExperimentSamples.push({
          variant: experimentVariant,
          ...sample,
          before,
          after,
        });
      else pointerGestures.push({ ...sample, before, after });
      await expect(board).not.toHaveClass(/map-panning|token-drag-active/);
      return { before, after };
    };
    for (let zoom = 0; zoom < 4; zoom += 1)
      await pointerPage
        .getByRole("button", { name: "Zoom battle map in", exact: true })
        .click();
    await expect
      .poll(async () => {
        const state = await pointerState();
        return state.scrollWidth - state.clientWidth;
      })
      .toBeGreaterThan(200);
    await expect(
      pointerPage.getByRole("button", {
        name: "Reset battle map zoom from 200%",
        exact: true,
      }),
    ).toBeVisible();
    const viewportBounds = (await viewport.boundingBox())!;
    const panFrom = {
      x: viewportBounds.x + viewportBounds.width * 0.6,
      y: viewportBounds.y + viewportBounds.height * 0.65,
    };
    const panTo = { x: panFrom.x - 180, y: panFrom.y - 80 };
    let panReferenceState: Awaited<ReturnType<typeof pointerState>> | undefined;
    const runPan = async (variant: string, experimental = false) => {
      await viewport.evaluate((element) => {
        element.scrollLeft = 0;
        element.scrollTop = 0;
      });
      await pointerPage.evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      );
      if (!panExperiment) return gesture("pan", "middle", panFrom, panTo);
      const filters = await computedPanFilters(pointerPage);
      const session = await clients[0]!.context.newCDPSession(pointerPage);
      let recording = false;
      let beforeMetrics:
        { metrics: Array<{ name: string; value: number }> } | undefined;
      let startedAt = Date.now();
      try {
        await session.send("Performance.enable");
        await session.send("Profiler.enable");
        await session.send("Profiler.setSamplingInterval", { interval: 1000 });
        beforeMetrics = await session.send("Performance.getMetrics");
        startedAt = Date.now();
        await session.send("Profiler.start");
        recording = true;
        const result = await gesture(
          "pan",
          "middle",
          panFrom,
          panTo,
          experimental ? variant : undefined,
        );
        panReferenceState ??= result.before;
        for (const key of [
          "tokenLeft",
          "tokenTop",
          "scrollWidth",
          "scrollHeight",
          "clientWidth",
          "clientHeight",
        ] as const)
          expect(result.before[key]).toBe(panReferenceState[key]);
        expect(result.before.scrollLeft).toBe(0);
        expect(result.before.scrollTop).toBe(0);
        expect(result.after.scrollLeft).toBeCloseTo(180, 1);
        expect(result.after.scrollTop).toBeCloseTo(80, 1);
        for (const key of [
          "tokenLeft",
          "tokenTop",
          "scrollWidth",
          "scrollHeight",
          "clientWidth",
          "clientHeight",
        ] as const)
          expect(result.after[key]).toBe(result.before[key]);
        return result;
      } finally {
        try {
          const profile = recording
            ? await session
                .send("Profiler.stop")
                .then((result) => result.profile)
                .catch(() => undefined)
            : undefined;
          const endedAt = Date.now();
          const afterMetrics = await session
            .send("Performance.getMetrics")
            .catch(() => undefined);
          const profilePath = testInfo.outputPath(
            `pan-client-1-${variant}.cpuprofile`,
          );
          if (profile) {
            writeFileSync(profilePath, JSON.stringify(profile));
            await testInfo.attach(`pan-client-1-${variant}`, {
              path: profilePath,
              contentType: "application/json",
            });
          }
          panDiagnostics.push({
            variant,
            startedAt,
            endedAt,
            filters,
            beforeMetrics,
            afterMetrics,
            cpuProfileFile: profile ? profilePath : null,
          });
        } finally {
          await session.detach().catch(() => undefined);
        }
      }
    };
    const panResult = await runPan("original");
    if (panExperiment) {
      panExperimentSamples.push({
        variant: "original",
        ...pointerGestures.find((sample) => sample.kind === "pan")!,
      });
      const originalFilters = await computedPanFilters(pointerPage);
      const override = await pointerPage.addStyleTag({
        content: `${panFilterSelectors} { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
      });
      try {
        const disabled = await computedPanFilters(pointerPage);
        expect(
          disabled.every(
            (element) =>
              element.filter === "none" && element.backdropFilter === "none",
          ),
        ).toBe(true);
        await runPan("filters_disabled", true);
      } finally {
        await override.evaluate((element) =>
          element.parentNode?.removeChild(element),
        );
      }
      const restoredFilters = await computedPanFilters(pointerPage);
      expect(restoredFilters).toEqual(originalFilters);
      await runPan("restored", true);
    }
    expect(panResult.after.scrollLeft).toBeGreaterThan(
      panResult.before.scrollLeft,
    );
    expect(panResult.after.tokenLeft).toBe(panResult.before.tokenLeft);
    expect(panResult.after.tokenTop).toBe(panResult.before.tokenTop);
    await pointerPage
      .getByRole("button", { name: /^Reset battle map zoom from / })
      .click();
    await expect(
      pointerPage.getByRole("button", {
        name: "Reset battle map zoom from 100%",
        exact: true,
      }),
    ).toBeVisible();
    const tokenBounds = (await tokenButton(pointerPage, 0).boundingBox())!;
    const dragFrom = {
      x: tokenBounds.x + tokenBounds.width / 2,
      y: tokenBounds.y + tokenBounds.height / 2,
    };
    const pointerMoveResponse = pointerPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/v1/scenes/${sceneId}/tokens/move`,
    );
    const dragResult = await gesture("token_drag", "left", dragFrom, {
      x: dragFrom.x + 80,
      y: dragFrom.y + 20,
    });
    commands.push(await recordCommand(await pointerMoveResponse, 0, "token"));
    expect(dragResult.after.tokenLeft).not.toBe(dragResult.before.tokenLeft);
    const finalPointerPosition = await tokenButton(pointerPage, 0).evaluate(
      (element) => ({
        left: (element as HTMLElement).style.left,
        top: (element as HTMLElement).style.top,
      }),
    );
    for (const client of clients)
      await expect
        .poll(() =>
          tokenButton(client.page, 0).evaluate((element) => ({
            left: (element as HTMLElement).style.left,
            top: (element as HTMLElement).style.top,
          })),
        )
        .toEqual(finalPointerPosition);
    await captureMemory("after_pointer_pan_and_drag");
    checkpoint(
      "native five-second pan and token drag measured with six clients connected",
    );

    const offline = clients[5]!;
    const closedBeforeOffline = offline.websocketCloses;
    await offline.context.setOffline(true);
    await offline.page.evaluate(() => {
      for (const socket of window.__multiplayerProbe.sockets)
        socket.close(4000, "Fixture offline transport disconnect");
    });
    await expect(offline.page.locator(".session-pulse")).not.toHaveAttribute(
      "data-connection-state",
      "connected",
      { timeout: 60_000 },
    );
    await expect
      .poll(() => offline.websocketCloses, { timeout: 60_000 })
      .toBeGreaterThan(closedBeforeOffline);
    const missedBody =
      "Multiplayer message committed while client 6 was offline";
    await clients[0]!.page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .fill(missedBody);
    const missedResponse = clients[0]!.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/chat/messages",
    );
    await clients[0]!.page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .press("Enter");
    commands.push(await recordCommand(await missedResponse, 0, "chat"));
    await expect(
      offline.page
        .getByLabel("Chat messages")
        .getByText(missedBody, { exact: true }),
    ).toHaveCount(0);
    const reconnectStartedAt = Date.now();
    await offline.context.setOffline(false);
    await ready(offline);
    await expect(
      offline.page
        .getByLabel("Chat messages")
        .getByText(missedBody, { exact: true }),
    ).toHaveCount(1);
    checkpoint("offline client reconciled missed acknowledged write", {
      reconnectAndSyncMs: Date.now() - reconnectStartedAt,
    });

    // Lose one successful HTTP response while leaving its server commit intact.
    // The unchanged composer must reuse that command identity after the crash.
    const retryClient = clients[1]!;
    const lostBody =
      "Multiplayer lost-response command survives crash exactly once";
    let lostCommand: Command | undefined;
    await retryClient.page.route(
      `${apiUrl}/api/v1/chat/messages`,
      async (route) => {
        const request = route.request();
        if (
          request.method() !== "POST" ||
          (request.postDataJSON() as { body?: string }).body !== lostBody ||
          lostCommand
        ) {
          await route.continue();
          return;
        }
        const accepted = await route.fetch();
        expect(accepted.ok(), await accepted.text()).toBe(true);
        const key = await request.headerValue("idempotency-key");
        expect(key).toBeTruthy();
        lostCommand = {
          sender: 1,
          kind: "chat",
          key: key!,
          method: "POST",
          url: request.url(),
          body: request.postDataJSON(),
          result: (await accepted.json()) as unknown,
          acknowledged: false,
        };
        commands.push(lostCommand);
        await route.abort("failed");
      },
    );
    await retryClient.page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .fill(lostBody);
    await retryClient.page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .press("Enter");
    await expect(
      retryClient.page.getByRole("alert").filter({ hasText: "Send failed" }),
    ).toBeVisible();
    expect(lostCommand).toBeDefined();
    await retryClient.page.unroute(`${apiUrl}/api/v1/chat/messages`);
    const beforeCrash = await control("/status", "GET");
    const closedBeforeCrash = clients.map((client) => client.websocketCloses);
    const tokensBeforeCrash = await browserGet<Token[]>(
      clients[0]!,
      `/api/v1/scenes/${sceneId}/tokens`,
    );
    const moveAuditPath =
      "/api/v1/admin/audit-logs?campaignId=camp_demo&action=token.move.batch&limit=10000";
    const beforeMoveAudit = await browserGet<{
      auditLogs: AuditLog[];
      summary: { truncated: boolean };
    }>(clients[0]!, moveAuditPath);
    expect(beforeMoveAudit.summary.truncated).toBe(false);
    expect(beforeMoveAudit.auditLogs).toHaveLength(
      commands.filter((command) => command.kind === "token").length,
    );
    await control("/crash");
    try {
      expect((await control("/status", "GET")).running).toBe(false);
      await Promise.all(
        clients.map(async (client, index) => {
          await expect
            .poll(() => client.websocketCloses, { timeout: 30_000 })
            .toBeGreaterThan(closedBeforeCrash[index]!);
          await expect(
            client.page.locator(".session-pulse"),
          ).not.toHaveAttribute("data-connection-state", "connected");
        }),
      );
      checkpoint(
        "owned API process killed; all six real transports disconnected",
        {
          previousGeneration: beforeCrash.generation,
          previousPid: beforeCrash.pid,
        },
      );
    } finally {
      await control("/start");
    }
    await Promise.all(clients.map(ready));
    const afterCrash = await control("/status", "GET");
    expect(afterCrash.generation).toBe(beforeCrash.generation + 1);
    expect(afterCrash.pid).not.toBe(beforeCrash.pid);
    const retriedResponse = retryClient.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/chat/messages",
    );
    await retryClient.page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .press("Enter");
    const retried = await recordCommand(await retriedResponse, 1, "chat");
    expect(retried.key).toBe(lostCommand!.key);
    expect(retried.result).toEqual(lostCommand!.result);
    await expect(
      retryClient.page.getByRole("textbox", {
        name: "Chat message",
        exact: true,
      }),
    ).toHaveValue("");
    for (const command of commands.filter((command) => command.acknowledged)) {
      const response = await clients[command.sender]!.page.request.fetch(
        command.url,
        {
          method: command.method,
          data: command.body as Record<string, unknown>,
          headers: { ...authHeaders, "idempotency-key": command.key },
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
      expect(await response.json()).toEqual(command.result);
    }
    const persistedTokens = await browserGet<Token[]>(
      clients[0]!,
      `/api/v1/scenes/${sceneId}/tokens`,
    );
    expect(
      [...persistedTokens].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    ).toEqual(
      [...tokensBeforeCrash].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );
    const afterMoveAudit = await browserGet<{
      auditLogs: AuditLog[];
      summary: { truncated: boolean };
    }>(clients[0]!, moveAuditPath);
    expect(afterMoveAudit.summary.truncated).toBe(false);
    expect(afterMoveAudit.auditLogs).toEqual(beforeMoveAudit.auditLogs);
    const expectedMessages = commands
      .filter((command) => command.kind === "chat")
      .map((command) => command.result as ChatMessage);
    for (const client of clients) {
      const persisted = await browserGet<ChatMessage[]>(
        client,
        "/api/v1/chat/messages?campaignId=camp_demo",
      );
      for (const message of expectedMessages)
        expect(
          persisted.filter(
            (entry) => entry.id === message.id || entry.body === message.body,
          ),
        ).toEqual([message]);
      const visibleTokens = await browserGet<Token[]>(
        client,
        `/api/v1/scenes/${sceneId}/tokens`,
      );
      for (let index = 0; index < 6; index += 1) {
        const expected = persistedTokens.find(
          (token) => token.id === `tok_load_${index}`,
        )!;
        expect(
          visibleTokens.find((token) => token.id === expected.id),
        ).toMatchObject({
          x: expected.x,
          y: expected.y,
          updatedAt: expected.updatedAt,
        });
        const gmLeft = await tokenButton(clients[0]!.page, index).evaluate(
          (element) => (element as HTMLElement).style.left,
        );
        await expect
          .poll(() =>
            tokenButton(client.page, index).evaluate(
              (element) => (element as HTMLElement).style.left,
            ),
          )
          .toBe(gmLeft);
      }
      await expect(
        client.page
          .getByLabel("Chat messages")
          .getByText(lostBody, { exact: true }),
      ).toHaveCount(1);
    }
    expect(browserErrors).toEqual([]);
    checkpoint(
      "all acknowledged commands survived crash; stored retries and lost-response UI retry produced no duplicates",
      {
        acknowledgedCommands: commands.filter((command) => command.acknowledged)
          .length,
        lostResponseUiRetries: 1,
        tokenMoveAuditRecordsUnchanged: afterMoveAudit.auditLogs.length,
        generation: afterCrash.generation,
      },
    );
  } finally {
    if (apiProfileStarted)
      await stopApiProfile().catch((error: unknown) =>
        apiProfileErrors.push(String(error)),
      );
    if (profiler) {
      const stoppedProfile = await profiler
        .send("Profiler.stop")
        .then((result) => result.profile)
        .catch(() => undefined);
      cpuProfile ??= stoppedProfile;
      profileStoppedAt = Date.now();
      await profiler.detach().catch(() => undefined);
    }
    if (cpuProfile) {
      const cpuPath = testInfo.outputPath(`${rendererProfileName}.cpuprofile`);
      writeFileSync(cpuPath, JSON.stringify(cpuProfile));
      await testInfo.attach(`${rendererProfileName}-cpu-profile`, {
        path: cpuPath,
        contentType: "application/json",
      });
    }
    const diagnostics: Array<{ client: number; data: MultiplayerDiagnostics }> =
      [];
    const diagnosticErrors: Array<{ client: number; message: string }> = [];
    if (profiling)
      for (const client of clients) {
        try {
          const data = await client.page.evaluate(() => {
            window.__multiplayerDiagnostics.enabled = false;
            return window.__multiplayerDiagnostics;
          });
          diagnostics.push({ client: client.index, data });
        } catch (error) {
          diagnosticErrors.push({
            client: client.index,
            message: String(error),
          });
        }
      }
    for (const client of clients)
      await client.context.setOffline(false).catch(() => undefined);
    const remote = (kind: Measurement["kind"]) =>
      measurements
        .filter((measurement) => measurement.kind === kind)
        .flatMap((measurement) =>
          measurement.observations
            .filter((observation) => observation.client !== measurement.sender)
            .map((observation) => observation.latencyMs),
        );
    const browserStates = await Promise.all(
      clients.map(async (client) => ({
        client: client.index,
        state: await client.page
          .evaluate(() => {
            const probe = window.__multiplayerProbe;
            const stream = document.querySelector<HTMLElement>(
              '[aria-label="Chat messages"]',
            );
            return {
              visibilityState: document.visibilityState,
              focused: document.hasFocus(),
              pendingObservations: Object.entries(probe.observations).filter(
                ([, observation]) => observation.seenAt === undefined,
              ),
              latestChatBodies: [...document.querySelectorAll(".chat-body")]
                .slice(-3)
                .map((element) => element.textContent),
              chatScroll: stream
                ? {
                    top: stream.scrollTop,
                    height: stream.scrollHeight,
                    clientHeight: stream.clientHeight,
                  }
                : null,
              realtimeState: document
                .querySelector(".session-pulse")
                ?.getAttribute("data-connection-state"),
            };
          })
          .catch((error: unknown) => ({ diagnosticError: String(error) })),
      })),
    );
    await captureBrowserEnvironment("after_workload_and_recovery");
    const budgetTarget = (samples: number[], targetP95Ms: number) => {
      const statistics = quantiles(samples);
      return {
        targetP95Ms,
        ...statistics,
        withinTarget:
          typeof statistics.p95Ms !== "number"
            ? null
            : statistics.p95Ms <= targetP95Ms,
      };
    };
    const targets = {
      remoteChatVisibility: budgetTarget(remote("chat"), 250),
      remoteTokenVisibility: budgetTarget(remote("token"), 250),
      pointerPanFrameIntervals: budgetTarget(
        pointerGestures
          .filter((gesture) => gesture.kind === "pan")
          .flatMap((gesture) =>
            gesture.intervals.map((frame) => frame.intervalMs),
          ),
        33.3,
      ),
      pointerDragFrameIntervals: budgetTarget(
        pointerGestures
          .filter((gesture) => gesture.kind === "token_drag")
          .flatMap((gesture) =>
            gesture.intervals.map((frame) => frame.intervalMs),
          ),
        33.3,
      ),
    };
    const correctnessPassed = Boolean(
      phases.at(-1)?.name.startsWith("all acknowledged"),
    );
    const acceptanceEligible =
      correctnessPassed &&
      !profiling &&
      metadata.trace === "off" &&
      metadata.actualActivePlayMs >= 180_000 &&
      pointerGestures.length === 2;
    const budgetVerdicts = {
      metric: "nearest-rank p95",
      acceptanceEligible,
      status: !acceptanceEligible
        ? "not_an_acceptance_measurement"
        : Object.values(targets).every((target) => target.withinTarget === true)
          ? "passed"
          : "failed",
      targets,
      qualification:
        "Single local host and six Chromium contexts; no independent device, WAN, GPU presentation, or cross-product equivalence claim. Profiled, traced, smoke, or incomplete runs report observations but cannot pass acceptance.",
    };
    const report = {
      status: phases.at(-1)?.name.startsWith("all acknowledged")
        ? "passed"
        : "incomplete_or_failed",
      metadata,
      browserEnvironment,
      budgetVerdicts,
      fixture,
      phases,
      startup,
      memory,
      pointerGestures,
      controlledPanExperiment: panExperiment
        ? {
            method:
              "Diagnostic-only same-host A/B/A sequence: native 200% middle-button pan with original CSS, selected map/control filter and backdrop-filter properties temporarily set to none, then original CSS restored. Each starts at viewport scroll 0,0 with the same mouse path. Only these CSS properties change, and temporary style removal occurs in finally. CPU profiling and Performance metric snapshots on client 0 add overhead. Fixed order can include warm-up effects; overridden CSS is never product acceptance. GPU data is browser-reported CDP SystemInfo, not a separate hardware benchmark.",
            filterSelectors: panFilterSelectors,
            gpuInformation,
            samples: panExperimentSamples,
            diagnostics: panDiagnostics,
          }
        : null,
      diagnosticProfile: profiling
        ? {
            method:
              "Opt-in native WebSocket message listeners timestamp event dispatch before the application listener. Fetch fulfillment records response-headers acknowledgment before application body parsing; it is not server commit time. PerformanceObserver long tasks and a 1ms CDP JavaScript CPU sample profile of the reported representative client add overhead and are diagnosis only.",
            representativeClient: profileClient,
            serverProfile: serverProfiling
              ? { result: apiProfileResult, errors: apiProfileErrors }
              : null,
            profileStartedAt,
            profileStoppedAt,
            profileMetrics,
            clients: diagnostics,
            diagnosticErrors,
          }
        : null,
      method:
        "Six isolated browser contexts in one Chromium process on one host, production Vite build and loopback API. Repeated rounds per sender of chat Enter and alternating token ArrowRight/ArrowLeft for the reported actual active-play duration. Native keydown capture to first requestAnimationFrame observing DOM text/position inside its visible viewport and scroll clips; this is DOM visibility at a frame boundary, not GPU presentation. Percentiles use nearest rank. Only animation-frame intervals entirely inside measured keydown-to-all-clients-visible windows contribute to frame statistics; idle intervals are excluded. These include shared-host contention. A separate first-client pointer phase measures whole RAF intervals inside native pointerdown-to-pointerup windows for a five-second middle-button pan at increased zoom and a five-second left-button token drag at 100% zoom, while the other five clients remain connected. Mouse events are driven sequentially with a 16ms requested pause; actual event counts and elapsed windows are retained. Pan changes viewport scroll; drag changes shared token state on release. Pointer intervals are not GPU presentation or an unbiased renderer benchmark, and there is no cross-product comparison. Offline fault combines Chromium HTTP-offline emulation with explicit native WebSocket closure because the browser keeps existing sockets open during emulation. API fault kills only the directly owned Node API process with SIGKILL. Startup includes automated login and correctness checks, with clients opened sequentially and server/OS caches potentially warm for later clients; browser contexts have isolated HTTP caches. Memory is unforced-GC JS heap/backing storage and DOM counters, not process RSS or GPU memory. Browser channel/headless configuration and raw browser CDP version/GPU feature snapshots are recorded outside action windows; headed mode alone does not establish hardware acceleration. Document visibility and focus are sampled during workload and pointer RAF collection. Six headed contexts share one desktop, so their focus states are not six physical users. No remote network or throughput saturation claim.",
      summary: {
        remoteChat: quantiles(remote("chat")),
        remoteToken: quantiles(remote("token")),
        pointerGestures: pointerGestures.map((gesture) => ({
          kind: gesture.kind,
          durationMs: (gesture.endedAt ?? 0) - (gesture.startedAt ?? 0),
          pointerMoves: gesture.pointerMoves,
          visibilityStates: gesture.visibilityStates,
          focusStates: gesture.focusStates,
          frameIntervals: quantiles(
            gesture.intervals.map((frame) => frame.intervalMs),
          ),
          over33Ms: gesture.intervals.filter((frame) => frame.intervalMs > 33.3)
            .length,
        })),
        frameIntervals: frameSamples.map((sample) => ({
          client: sample.client,
          ...quantiles(sample.intervals.map((frame) => frame.intervalMs)),
          over33Ms: sample.intervals.filter((frame) => frame.intervalMs > 33.3)
            .length,
          visibilityStates: sample.visibilityStates,
          focusStates: sample.focusStates,
        })),
      },
      measurements,
      frameSamples,
      browserErrors,
      browserStates,
      commands: commands.map(({ body: _body, ...command }) => command),
    };
    const path = testInfo.outputPath("multiplayer-evidence.json");
    writeFileSync(path, JSON.stringify(report, null, 2));
    await testInfo.attach("multiplayer-evidence", {
      path,
      contentType: "application/json",
    });
    for (const client of clients) {
      await client.page
        .screenshot({
          path: testInfo.outputPath(`client-${client.index + 1}.png`),
        })
        .catch(() => undefined);
      await client.context.close();
    }
  }
});
