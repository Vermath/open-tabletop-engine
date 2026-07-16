import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.OTTE_E2E_CANONICAL_API_PORT ?? 4120);
const webPort = Number(process.env.OTTE_E2E_CANONICAL_WEB_PORT ?? 5194);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const webSnapshotRoot = process.env.OTTE_E2E_CANONICAL_WEB_ROOT?.trim();
const webCommand = webSnapshotRoot
  ? `pnpm --filter @open-tabletop/web exec vite "${webSnapshotRoot}" --config "${webSnapshotRoot}/vite.config.ts" --host 127.0.0.1 --port ${webPort} --strictPort`
  : process.env.OTTE_E2E_CANONICAL_PREVIEW === "true"
    ? `pnpm --filter @open-tabletop/web exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`
    : `pnpm --filter @open-tabletop/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/canonical-public-journey.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 480_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/e2e/start-api.mjs",
      url: `${apiBaseUrl}/api/v1/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        OTTE_E2E_API_PORT: String(apiPort),
        OTTE_DEMO_SEED: "false",
      },
    },
    {
      command: webCommand,
      url: webBaseUrl,
      timeout: 60_000,
      reuseExistingServer: false,
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
