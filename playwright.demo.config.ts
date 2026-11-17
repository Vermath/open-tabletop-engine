import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

const apiPort = Number(process.env.OTTE_E2E_DEMO_API_PORT ?? 4114);
const webPort = Number(process.env.OTTE_E2E_DEMO_WEB_PORT ?? 5186);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  ...base,
  testMatch: "**/demo-presentation.spec.ts",
  testIgnore: [],
  use: { ...base.use, baseURL: webOrigin, extraHTTPHeaders: { Origin: webOrigin } },
  webServer: [
    {
      command: "node tests/e2e/start-api.mjs",
      url: apiOrigin + "/api/v1/health",
      timeout: 60_000,
      env: {
        OTTE_E2E_API_PORT: String(apiPort),
        OTTE_CORS_ALLOWED_ORIGINS: webOrigin,
        OTTE_WEB_ORIGIN: webOrigin,
        OTTE_DEMO_SEED: "true",
        OTTE_E2E_DEMO_PRESENTATION: "true",
      },
    },
    {
      command: `pnpm --filter @open-tabletop/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webOrigin,
      timeout: 60_000,
      env: { VITE_API_URL: apiOrigin },
    },
  ],
});
