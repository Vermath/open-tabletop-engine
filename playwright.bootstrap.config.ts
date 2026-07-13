import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.OTTE_E2E_BOOTSTRAP_API_PORT ?? 4110);
const webPort = Number(process.env.OTTE_E2E_BOOTSTRAP_WEB_PORT ?? 5184);
const emailWebhookPort = Number(
  process.env.OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT ?? 4112,
);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

function quoteShellArgument(value: string): string {
  if (process.platform === "win32") return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function packageManagerCommand(args: string): string {
  return `${quoteShellArgument(process.execPath)} scripts/run-package-manager.mjs ${args}`;
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/bootstrap.spec.ts",
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 5_000,
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
        OTTE_EMAIL_WEBHOOK_URL: `http://127.0.0.1:${emailWebhookPort}/email`,
        OTTE_EMAIL_WEBHOOK_TIMEOUT_MS: "500",
      },
    },
    {
      command: packageManagerCommand(
        "--filter @open-tabletop/web exec vite --host 127.0.0.1 --port " +
          webPort +
          " --strictPort",
      ),
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
