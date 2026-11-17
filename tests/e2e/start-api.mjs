import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";

const apiPort = process.env.OTTE_E2E_API_PORT ?? "4100";
if (!/^\d{2,5}$/.test(apiPort)) throw new Error("OTTE_E2E_API_PORT must be a numeric TCP port");
const controlPort = Number(process.env.OTTE_E2E_API_CONTROL_PORT ?? Number(apiPort) + 1000);
const storageRoot = resolve(process.cwd(), "storage");
const runStorageRoot = resolve(storageRoot, `e2e-${apiPort}`);
if (!runStorageRoot.startsWith(`${storageRoot}${sep}`)) throw new Error("E2E storage path escaped the workspace storage root");
rmSync(runStorageRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
mkdirSync(runStorageRoot, { recursive: true });
const dbPath = resolve(runStorageRoot, "state.sqlite");
const aiGatePath = resolve(runStorageRoot, "ai-provider.release");

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");
const apiEntryPath = resolve(process.cwd(), "tests", "e2e", "api-entry.ts");
let child;
let generation = 0;
let intentionalStop = false;
let shuttingDown = false;
let restartInFlight;

function spawnApi() {
  intentionalStop = false;
  generation += 1;
  // Run the API in the directly owned Node process. On Windows, killing a
  // package-manager wrapper leaves its API grandchild alive and makes a real
  // restart fail with EADDRINUSE.
  const nextChild = spawn(process.execPath, [tsxCliPath, apiEntryPath], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: apiPort,
      OTTE_SQLITE_PATH: dbPath,
      OTTE_DEMO_SEED: process.env.OTTE_DEMO_SEED ?? "true",
      OTTE_ADMIN_USER_IDS: process.env.OTTE_ADMIN_USER_IDS ?? "usr_demo_gm",
      OTTE_AI_PROVIDER: process.env.OTTE_AI_PROVIDER ?? "codex-loopback",
      OTTE_E2E_AI_GATE_PATH: aiGatePath,
      OTTE_E2E_AI_MAX_WAIT_MS: process.env.OTTE_E2E_AI_MAX_WAIT_MS ?? "15000",
    },
  });
  child = nextChild;
  nextChild.on("exit", (code, signal) => {
    if (child === nextChild) child = undefined;
    if (!intentionalStop && !shuttingDown) {
      controlServer.close();
      process.exit(code ?? (signal ? 0 : 1));
    }
  });
  return nextChild;
}

async function stopApi(signal = "SIGTERM") {
  const current = child;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  intentionalStop = true;
  const exited = new Promise((resolveExit) => current.once("exit", resolveExit));
  current.kill(signal);
  await exited;
}

async function restartApi() {
  if (restartInFlight) return restartInFlight;
  restartInFlight = (async () => {
    await stopApi();
    spawnApi();
    return generation;
  })().finally(() => {
    restartInFlight = undefined;
  });
  return restartInFlight;
}

const controlServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/status") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ generation, running: Boolean(child && child.exitCode === null && child.signalCode === null) }));
    return;
  }
  if (request.method === "POST" && request.url === "/restart") {
    void restartApi().then(
      (nextGeneration) => {
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ generation: nextGeneration, restarted: true }));
      },
      (error) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      },
    );
    return;
  }
  if (request.method === "POST" && request.url === "/ai/reset") {
    rmSync(aiGatePath, { force: true, maxRetries: 5, retryDelay: 100 });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ reset: true }));
    return;
  }
  if (request.method === "POST" && request.url === "/ai/release") {
    writeFileSync(aiGatePath, `${generation}\n`, "utf8");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ released: true, generation }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

controlServer.listen(controlPort, "127.0.0.1");
spawnApi();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    controlServer.close();
    await stopApi(signal);
    process.exit(0);
  });
}
