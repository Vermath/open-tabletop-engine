import { defineConfig, devices } from "@playwright/test";

// Run one engine at a time so each invocation gets a fresh isolated API store,
// including the empty deployment needed by the existing owner bootstrap test.
const browser = process.env.OTTE_CROSSBROWSER_BROWSER ?? "firefox";
const suite = process.env.OTTE_CROSSBROWSER_SUITE ?? "representative";
if (browser !== "firefox" && browser !== "webkit") {
  throw new Error("OTTE_CROSSBROWSER_BROWSER must be firefox or webkit");
}
if (suite !== "representative" && suite !== "bootstrap") {
  throw new Error(
    "OTTE_CROSSBROWSER_SUITE must be representative or bootstrap",
  );
}

const apiPort = Number(process.env.OTTE_CROSSBROWSER_API_PORT ?? 4240);
const webPort = Number(process.env.OTTE_CROSSBROWSER_WEB_PORT ?? 5314);
const controlPort = Number(process.env.OTTE_CROSSBROWSER_CONTROL_PORT ?? 6240);
const emailPort = Number(process.env.OTTE_CROSSBROWSER_EMAIL_PORT ?? 4242);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const outputRoot = `output/competitive/crossbrowser/${browser}-${suite}`;

// Existing tests read these variables directly in their worker processes.
process.env.OTTE_E2E_API_PORT = String(apiPort);
process.env.OTTE_E2E_API_CONTROL_PORT = String(controlPort);
process.env.OTTE_E2E_BOOTSTRAP_API_PORT = String(apiPort);
process.env.OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT = String(emailPort);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch:
    suite === "bootstrap"
      ? "**/bootstrap.spec.ts"
      : ["**/auth-tabletop.spec.ts", "**/browser-evidence.spec.ts"],
  grep:
    suite === "bootstrap"
      ? /clean deployment routes to owner bootstrap and opens the starter campaign/
      : /GM can box-select and drag multiple scene tokens|GM can export and safely re-import a campaign archive|player can accept an invite from a private browser session|reviewed D&D core state survives API restart and archive round trip/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalTimeout: 600_000,
  expect: { timeout: 10_000 },
  outputDir: `${outputRoot}/test-results`,
  reporter: [["list"], ["json", { outputFile: `${outputRoot}/results.json` }]],
  use: {
    baseURL: webBaseUrl,
    extraHTTPHeaders: { Origin: webBaseUrl },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
        OTTE_E2E_API_CONTROL_PORT: String(controlPort),
        OTTE_CORS_ALLOWED_ORIGINS: webBaseUrl,
        OTTE_WEB_ORIGIN: webBaseUrl,
        OTTE_DEMO_SEED: suite === "bootstrap" ? "false" : "true",
        ...(suite === "bootstrap"
          ? {
              OTTE_EMAIL_WEBHOOK_URL: `http://127.0.0.1:${emailPort}/email`,
              OTTE_EMAIL_WEBHOOK_TIMEOUT_MS: "500",
            }
          : {}),
      },
    },
    {
      command: `pnpm --filter @open-tabletop/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webBaseUrl,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { ...process.env, VITE_API_URL: apiBaseUrl },
    },
  ],
  projects: [
    {
      name: browser,
      use: {
        ...devices[
          browser === "firefox" ? "Desktop Firefox" : "Desktop Safari"
        ],
      },
    },
  ],
});
