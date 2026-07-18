import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.OTTE_E2E_API_PORT ?? 4100);
const webPort = Number(process.env.OTTE_E2E_WEB_PORT ?? 5174);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const reuseExistingServer = process.env.OTTE_E2E_REUSE_SERVER === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: [
    "**/bootstrap.spec.ts",
    "**/canonical-public-journey.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webBaseUrl,
    extraHTTPHeaders: { Origin: webBaseUrl },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/e2e/start-api.mjs",
      url: `${apiBaseUrl}/api/v1/health`,
      timeout: 30_000,
      reuseExistingServer,
      env: {
        ...process.env,
        OTTE_E2E_API_PORT: String(apiPort),
        OTTE_CORS_ALLOWED_ORIGINS: webBaseUrl,
        OTTE_WEB_ORIGIN: webBaseUrl,
      },
    },
    {
      command: `pnpm --filter @open-tabletop/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webBaseUrl,
      timeout: 30_000,
      reuseExistingServer,
      env: {
        ...process.env,
        VITE_API_URL: apiBaseUrl,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
