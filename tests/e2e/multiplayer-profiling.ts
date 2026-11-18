import type { Browser, CDPSession, Page } from "@playwright/test";

export type MultiplayerDiagnostics = {
  enabled: boolean;
  websocketEvents: Array<{ receivedAt: number; data: string }>;
  requests: Array<{
    url: string;
    method: string;
    idempotencyKey: string | null;
    startedAt: number;
    acknowledgedAt?: number;
    status?: number;
    failedAt?: number;
  }>;
  longTasks: Array<{ startedAt: number; durationMs: number; name: string }>;
  longTaskSupport: boolean;
};

declare global {
  interface Window {
    __multiplayerDiagnostics: MultiplayerDiagnostics;
  }
}

// Diagnostic mode only: this adds listeners and promise work, so its timings
// must never substitute for the unprofiled acceptance run.
export function installMultiplayerDiagnostics() {
  const diagnostics: MultiplayerDiagnostics = {
    enabled: true,
    websocketEvents: [],
    requests: [],
    longTasks: [],
    longTaskSupport:
      PerformanceObserver.supportedEntryTypes.includes("longtask"),
  };
  window.__multiplayerDiagnostics = diagnostics;
  const epoch = () => performance.timeOrigin + performance.now();
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(target, args) {
      const socket = Reflect.construct(target, args) as WebSocket;
      socket.addEventListener("message", (event) => {
        if (diagnostics.enabled && diagnostics.websocketEvents.length < 10_000)
          diagnostics.websocketEvents.push({
            receivedAt: epoch(),
            data:
              typeof event.data === "string" ? event.data : "[non-text event]",
          });
      });
      return socket;
    },
  });
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    if (!diagnostics.enabled) return originalFetch.call(this, input, init);
    const request = input instanceof Request ? input : undefined;
    const record: MultiplayerDiagnostics["requests"][number] = {
      url: request?.url ?? String(input),
      method: init?.method ?? request?.method ?? "GET",
      idempotencyKey: new Headers(init?.headers ?? request?.headers).get(
        "idempotency-key",
      ),
      startedAt: epoch(),
    };
    diagnostics.requests.push(record);
    try {
      const response = await originalFetch.call(this, input, init);
      // Fetch fulfillment means response headers are available. Body parsing
      // and React work occur after this timestamp and are not part of this ACK.
      record.acknowledgedAt = epoch();
      record.status = response.status;
      return response;
    } catch (error) {
      record.failedAt = epoch();
      throw error;
    }
  };
  if (diagnostics.longTaskSupport)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (diagnostics.enabled)
          diagnostics.longTasks.push({
            startedAt: performance.timeOrigin + entry.startTime,
            durationMs: entry.duration,
            name: entry.name,
          });
    }).observe({ type: "longtask", buffered: true });
}

// Collected outside the measured action windows, in every browser scenario.
// Keep raw feature status: a headed window does not prove GPU acceleration.
export async function browserHardwareInformation(browser: Browser) {
  const collectedAt = new Date().toISOString();
  let session: CDPSession | undefined;
  try {
    session = await browser.newBrowserCDPSession();
    const version = await session
      .send("Browser.getVersion")
      .catch((error: unknown) => ({ unavailable: String(error) }));
    const systemInfo = await session
      .send("SystemInfo.getInfo")
      .then((info) => ({
        gpu: info.gpu,
        modelName: info.modelName,
        modelVersion: info.modelVersion,
      }))
      .catch((error: unknown) => ({ unavailable: String(error) }));
    return { collectedAt, version, systemInfo };
  } catch (error) {
    return { collectedAt, unavailable: String(error) };
  } finally {
    await session?.detach().catch(() => undefined);
  }
}

export async function rendererMemory(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    const heap = await session.send("Runtime.getHeapUsage");
    const dom = await session.send("Memory.getDOMCounters");
    return { collectedAt: new Date().toISOString(), heap, dom };
  } finally {
    await session.detach();
  }
}

export const panFilterSelectors =
  ".scene-map, .toolbar, .map-layer-stack, .map-zoom-control, .map-selection-status, .table-tool-panel, .scene-viewport, .scene-board, .map-layer-dock, .table-area";

export async function computedPanFilters(page: Page) {
  return page.evaluate(
    (selectors) =>
      [...document.querySelectorAll<HTMLElement>(selectors)].map((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          webkitBackdropFilter: style.getPropertyValue(
            "-webkit-backdrop-filter",
          ),
          opacity: style.opacity,
          width: bounds.width,
          height: bounds.height,
          visible:
            element.getClientRects().length > 0 &&
            style.visibility !== "hidden",
        };
      }),
    panFilterSelectors,
  );
}
