import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.js";

/**
 * Board rendering measurements: `pnpm perf:board`.
 *
 * Serves a production build of the web client (the default suite uses the
 * dev server, whose development-mode React inflates frame times) and runs one
 * test that builds a large scene and records frame intervals.
 */
const apiPort = Number(process.env.OTTE_E2E_API_PORT ?? 4100);
const webPort = Number(process.env.OTTE_E2E_WEB_PORT ?? 5174);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const [apiServer] = Array.isArray(base.webServer) ? base.webServer : [base.webServer];
const channel = process.env.OTTE_PERF_BROWSER_CHANNEL;

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /board-performance\.perf\.ts$/,
  timeout: 600_000,
  reporter: "list",
  webServer: [
    apiServer!,
    {
      command: `pnpm --filter @open-tabletop/web exec vite build --outDir .perf-dist --emptyOutDir && pnpm --filter @open-tabletop/web exec vite preview --outDir .perf-dist --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webBaseUrl,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { ...process.env, VITE_API_URL: apiBaseUrl },
    },
  ],
  projects: [
    {
      name: "board-perf",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...(channel ? { channel } : {}) },
    },
  ],
});
