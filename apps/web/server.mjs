import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("./", import.meta.url));
const root = join(appRoot, "dist");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4173);
const defaultRailwayApiUrl = "http://open-tabletopapi.railway.internal:8080";
const apiBaseUrl =
  process.env.OTTE_API_URL ??
  process.env.VITE_API_URL ??
  (process.env.NODE_ENV === "production" ? defaultRailwayApiUrl : undefined);

const { startWebStaticRuntime } =
  await import("./dist/server/static-runtime.js");
const runtime = await startWebStaticRuntime({
  host,
  port,
  root,
  apiBaseUrl,
  closeTimeoutMs: boundedNumber(
    process.env.OTTE_WEB_SHUTDOWN_TIMEOUT_MS,
    1_000,
    0,
    30_000,
  ),
});

console.log(`open-tabletop-web listening on ${runtime.url}`);
if (apiBaseUrl)
  console.log(`open-tabletop-web proxying /api to ${redactUrl(apiBaseUrl)}`);

let shutdownPromise;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdownPromise ??= runtime.close().catch((error) => {
      process.exitCode = 1;
      console.error("open-tabletop-web shutdown failed", error);
    });
  });
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function redactUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.toString().replace(/\/$/, "");
}
