import { defineConfig, devices } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const apiPort = Number(process.env.OTTE_MULTIPLAYER_API_PORT ?? 4230);
const webPort = Number(process.env.OTTE_MULTIPLAYER_WEB_PORT ?? 5304);
const controlPort = Number(process.env.OTTE_MULTIPLAYER_CONTROL_PORT ?? 6230);
// Optional installed Chrome scenario; defaults remain bundled headless Chromium.
const browserChannel = process.env.OTTE_MULTIPLAYER_BROWSER_CHANNEL;
const headed = process.env.OTTE_MULTIPLAYER_HEADED;
const serverProfiling = process.env.OTTE_MULTIPLAYER_SERVER_PROFILE === "1";
if (browserChannel !== undefined && browserChannel !== "chrome")
  throw new Error("OTTE_MULTIPLAYER_BROWSER_CHANNEL must be chrome or unset");
if (headed !== undefined && headed !== "0" && headed !== "1")
  throw new Error("OTTE_MULTIPLAYER_HEADED must be 0, 1, or unset");
if (
  ![apiPort, webPort, controlPort].every(
    (port) => Number.isInteger(port) && port >= 1024 && port <= 65535,
  ) ||
  new Set([apiPort, webPort, controlPort]).size !== 3
)
  throw new Error(
    "Multiplayer fixture ports must be distinct TCP ports above 1023",
  );
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const storageParent = resolve("storage");
const storageRoot = resolve(storageParent, `e2e-multiplayer-${apiPort}`);
const webRoot = resolve(storageParent, `e2e-multiplayer-web-${apiPort}`);
for (const target of [storageRoot, webRoot]) {
  if (!target.startsWith(`${storageParent}${sep}`))
    throw new Error(
      "Multiplayer fixture escaped its isolated storage directory",
    );
}
const nodeRequire = createRequire(import.meta.url);
const thisFile = resolve("playwright.multiplayer.config.ts");
const tsxLoader = pathToFileURL(nodeRequire.resolve("tsx")).href;
const controlKey = process.env.OTTE_MULTIPLAYER_CONTROL_KEY ?? randomUUID();
process.env.OTTE_MULTIPLAYER_CONTROL_KEY = controlKey;
const fixtureEnv = {
  ...process.env,
  NODE_ENV: "test",
  OTTE_DEMO_SEED: "false",
  OTTE_ADMIN_USER_IDS: "usr_demo_gm",
  OTTE_CORS_ALLOWED_ORIGINS: webUrl,
  OTTE_WEB_ORIGIN: webUrl,
  OTTE_SQLITE_PATH: resolve(storageRoot, "state.sqlite"),
  OTTE_UPLOAD_DIR: resolve(storageRoot, "uploads"),
  OTTE_PLUGIN_DIR: resolve(storageRoot, "plugins"),
  OTTE_ASSET_STORAGE: "local",
  OTTE_MULTIPLAYER_CONTROL_KEY: controlKey,
  VITE_API_URL: apiUrl,
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/multiplayer-recovery.spec.ts",
  outputDir: "output/playwright/multiplayer-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "output/playwright/multiplayer-results/playwright-report.json",
      },
    ],
  ],
  use: {
    baseURL: webUrl,
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace:
      process.env.OTTE_MULTIPLAYER_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "multiplayer-chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
        headless: headed !== "1",
        viewport: { width: 1440, height: 1000 },
        launchOptions: {
          args: [
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx playwright.multiplayer.config.ts --api-fixture",
      url: `${apiUrl}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: fixtureEnv,
    },
    {
      command: "pnpm exec tsx playwright.multiplayer.config.ts --web-fixture",
      url: webUrl,
      timeout: 180_000,
      reuseExistingServer: false,
      env: fixtureEnv,
    },
  ],
});

// The dedicated config also owns its fixture processes. No product route or
// shared preview process receives seed/reset/crash controls.
if (process.argv.includes("--api-fixture")) await superviseApi();
if (process.argv.includes("--api-child")) await startFixtureApi();
if (process.argv.includes("--web-fixture")) await serveBuiltWeb();

async function superviseApi(): Promise<void> {
  let child: ChildProcess | undefined;
  let generation = 0;
  let stopping = false;
  let restarting = false;
  const launch = () => {
    generation += 1;
    child = spawn(
      process.execPath,
      ["--import", tsxLoader, thisFile, "--api-child"],
      {
        shell: false,
        stdio: serverProfiling
          ? ["ignore", "inherit", "inherit", "ipc"]
          : "inherit",
        env: fixtureEnv,
      },
    );
    child.on("exit", (code) => {
      if (!stopping && !restarting) {
        control.close();
        process.exit(code ?? 1);
      }
    });
  };
  const stop = async (signal: NodeJS.Signals) => {
    const ownedChild = child;
    if (
      !ownedChild ||
      ownedChild.exitCode !== null ||
      ownedChild.signalCode !== null
    )
      return;
    await new Promise<void>((done) => {
      ownedChild.once("exit", () => done());
      ownedChild.kill(signal);
    });
  };
  const requestProfile = (action: "start" | "stop") =>
    new Promise<unknown>((resolveProfile, reject) => {
      const ownedChild = child;
      if (!ownedChild?.connected) {
        reject(new Error("Owned API IPC is unavailable"));
        return;
      }
      const id = randomUUID();
      const cleanup = () => {
        clearTimeout(timer);
        ownedChild.off("message", onMessage);
        ownedChild.off("exit", onExit);
      };
      const onExit = () => {
        cleanup();
        reject(new Error("Owned API exited during profiling control"));
      };
      const onMessage = (message: unknown) => {
        if (
          !message ||
          typeof message !== "object" ||
          !("id" in message) ||
          message.id !== id
        )
          return;
        cleanup();
        if ("error" in message) reject(new Error(String(message.error)));
        else resolveProfile("result" in message ? message.result : null);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Owned API profiling control timed out"));
      }, 15_000);
      ownedChild.on("message", onMessage);
      ownedChild.once("exit", onExit);
      ownedChild.send({ type: "multiplayer-profile", id, action }, (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
    });
  const control = createServer((request, response) => {
    if (request.headers["x-fixture-control-key"] !== controlKey) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (
      serverProfiling &&
      request.method === "POST" &&
      ["/profile/start", "/profile/stop"].includes(request.url ?? "")
    ) {
      void requestProfile(
        request.url === "/profile/start" ? "start" : "stop",
      ).then(
        (result) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(result));
        },
        (error: unknown) => {
          response.writeHead(500);
          response.end(String(error));
        },
      );
      return;
    }
    if (request.url === "/status" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          generation,
          pid: child?.pid,
          running: Boolean(
            child && child.exitCode === null && child.signalCode === null,
          ),
          storageRoot,
          apiPort,
          webPort,
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      request.url === "/start" &&
      (!child || child.exitCode !== null || child.signalCode !== null)
    ) {
      restarting = false;
      launch();
      response.writeHead(202);
      response.end(JSON.stringify({ generation, started: true }));
      return;
    }
    if (
      request.method !== "POST" ||
      !["/restart", "/crash-restart", "/crash"].includes(request.url ?? "") ||
      restarting
    ) {
      response.writeHead(409);
      response.end();
      return;
    }
    restarting = true;
    void stop(request.url === "/restart" ? "SIGTERM" : "SIGKILL").then(
      () => {
        const restart = request.url !== "/crash";
        if (restart) launch();
        restarting = !restart;
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ generation, restarted: restart }));
      },
      (error: unknown) => {
        restarting = false;
        response.writeHead(500);
        response.end(String(error));
      },
    );
  });
  await new Promise<void>((done, reject) => {
    control.once("error", reject);
    control.listen(controlPort, "127.0.0.1", done);
  });
  rmSync(storageRoot, { recursive: true, force: true });
  mkdirSync(storageRoot, { recursive: true });
  launch();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      stopping = true;
      control.close();
      void stop("SIGTERM").finally(() => process.exit(0));
    });
}

async function startFixtureApi(): Promise<void> {
  const { SqliteStateStore } = await import("./apps/api/src/sqlite-store.js");
  const { buildApp } = await import("./apps/api/src/app.js");
  const path = resolve(storageRoot, "state.sqlite");
  const fresh = !existsSync(path);
  const store = new SqliteStateStore(path, { seedDemo: false });
  if (fresh) await seedHistoricalCampaign(store);
  const apiProfile = serverProfiling
    ? (
        await import("./tests/e2e/multiplayer-api-profiling.js")
      ).installMultiplayerApiProfiling(store, storageRoot)
    : undefined;
  const app = await buildApp({
    store,
    uploadDir: resolve(storageRoot, "uploads"),
    pluginRoot: resolve(storageRoot, "plugins"),
  });
  if (apiProfile) {
    apiProfile.attach(app);
    process.on("message", (message: unknown) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "multiplayer-profile" ||
        !("id" in message) ||
        typeof message.id !== "string" ||
        !("action" in message) ||
        !["start", "stop"].includes(String(message.action))
      )
        return;
      const id = message.id;
      void (
        message.action === "start" ? apiProfile.start() : apiProfile.stop()
      ).then(
        (result) => process.send?.({ id, result }),
        (error: unknown) =>
          process.send?.({
            id,
            error:
              error instanceof Error
                ? error.name + ": " + error.message
                : String(error),
          }),
      );
    });
  }
  await app.listen({ host: "127.0.0.1", port: apiPort });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close().finally(() => process.exit(0));
    });
}

async function seedHistoricalCampaign(
  store: import("./apps/api/src/sqlite-store.js").SqliteStateStore,
): Promise<void> {
  const { seedState } = await import("./packages/core/src/index.js");
  const { LocalAssetStorage } = await import("./apps/api/src/asset-storage.js");
  const state = seedState();
  const timestamp = "2026-08-01T00:00:00.000Z";
  const baseUser = state.users[0]!;
  const baseMember = state.members[0]!;
  const baseOrganizationMember = state.organizationMembers[0]!;
  const userIds = [
    "usr_demo_gm",
    ...Array.from({ length: 5 }, (_, index) => `usr_load_player_${index + 1}`),
  ];
  state.users = userIds.map((id, index) => {
    const salt = `multiplayer-fixture-${index}`;
    return {
      ...baseUser,
      id,
      email: `load${index}@example.test`,
      displayName: index === 0 ? "Load GM" : `Load Player ${index}`,
      passwordHash: `scrypt:${salt}:${scryptSync("Multiplayer-fixture-2026!", salt, 32).toString("base64url")}`,
      passwordResetRequired: false,
    };
  });
  state.members = userIds.map((userId, index) => ({
    ...baseMember,
    id: `mem_load_${index}`,
    userId,
    role: index === 0 ? "owner" : "player",
  }));
  state.organizationMembers = userIds.map((userId, index) => ({
    ...baseOrganizationMember,
    id: `orgmem_load_${index}`,
    userId,
    role: index === 0 ? "owner" : "member",
  }));
  state.sessions = [];
  const scene = state.scenes[0]!;
  state.scenes = Array.from({ length: 100 }, (_, index) => ({
    ...structuredClone(scene),
    id: index === 0 ? scene.id : `scn_load_history_${index}`,
    name: index === 0 ? "Multiplayer Vault" : `Historical chamber ${index}`,
    width: 2400,
    height: 1600,
    active: index === 0,
    sortOrder: index,
    fog: [],
    fogHistory: [],
    walls: [],
    lights: [],
    annotations: [],
    activationHistory: [],
    metadata: { evidenceFixture: true },
  }));
  const actor = state.actors[0]!;
  state.actors = Array.from({ length: 200 }, (_, index) => ({
    ...structuredClone(actor),
    id: `act_load_${index}`,
    name: `Historical actor ${index}`,
    ownerUserId: userIds[index % 6],
    type: index < 6 ? "character" : "npc",
    permissions: {},
  }));
  const token = state.tokens[0]!;
  state.tokens = Array.from({ length: 50 }, (_, index) => ({
    ...structuredClone(token),
    id: `tok_load_${index}`,
    actorId: `act_load_${index}`,
    name: index === 49 ? "Private ambush sentinel" : `Load token ${index}`,
    sceneId: scene.id,
    x: 240 + (index % 10) * 180,
    y: 240 + Math.floor(index / 10) * 180,
    width: 80,
    height: 80,
    hidden: index === 49,
    layer: index === 49 ? "gm" : "player",
    ownerUserIds: [userIds[index % 6]!],
    visionEnabled: false,
    visionRadius: 0,
  }));
  state.chat = Array.from({ length: 2000 }, (_, index) => ({
    id: `msg_load_history_${index}`,
    campaignId: "camp_demo",
    sceneId: scene.id,
    userId: userIds[index % 6]!,
    type: index % 2 ? "roll" : "plain",
    body:
      index % 2
        ? `Historical perception roll ${index}`
        : `Session ${Math.floor(index / 40)}: the party explores chamber ${index % 100}.`,
    visibility: "public",
    recipientUserIds: [],
    ...(index % 2 ? { rollId: `roll_load_history_${index}` } : {}),
    createdAt: new Date(Date.parse(timestamp) + index * 1000).toISOString(),
    updatedAt: timestamp,
  }));
  state.chat.push({
    ...state.chat[0]!,
    id: "msg_load_private",
    createdAt: new Date(Date.parse(timestamp) + 2_001_000).toISOString(),
    body: "Private ambush plan: the north door is trapped",
    visibility: "gm_only",
    userId: userIds[0]!,
  });
  state.rolls = Array.from({ length: 2000 }, (_, index) => ({
    id: `roll_load_history_${index}`,
    campaignId: "camp_demo",
    userId: userIds[index % 6]!,
    formula: "1d20+2",
    label: `Historical check ${index}`,
    visibility: "public",
    terms: [
      { type: "die", sides: 20, count: 1, results: [(index % 20) + 1] },
      { type: "modifier", value: 2 },
    ],
    total: (index % 20) + 3,
    createdAt: new Date(Date.parse(timestamp) + index * 1000).toISOString(),
    updatedAt: timestamp,
  }));
  state.items = [];
  state.combats = [];
  state.encounters = [];
  state.assets = [];
  const width = 4096;
  const height = 3072;
  const pixels = Buffer.alloc(width * height * 3);
  let noise = 9012026;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const wall = x % 512 < 18 || y % 512 < 18;
      const shade = (wall ? 35 : 85) + (noise >>> 26);
      const offset = (y * width + x) * 3;
      pixels[offset] = shade + 18;
      pixels[offset + 1] = shade + 8;
      pixels[offset + 2] = shade;
    }
  const apiRequire = createRequire(resolve("apps/api/package.json"));
  const sharp = apiRequire(
    "sharp",
  ) as typeof import("./apps/api/node_modules/sharp/lib/index.js");
  const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
  const asset = {
    id: "asset_load_map",
    campaignId: "camp_demo",
    name: "Generated textured tactical map",
    url: "/api/v1/assets/asset_load_map/blob",
    mimeType: "image/jpeg",
    sizeBytes: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    image: { width, height },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const storage = await new LocalAssetStorage(
    resolve(storageRoot, "uploads"),
  ).put(asset, bytes);
  state.assets.push({ ...asset, storage });
  state.scenes[0]!.backgroundAssetId = asset.id;
  store.replace(state);
  writeFileSync(
    resolve(storageRoot, "fixture.json"),
    JSON.stringify(
      {
        campaignId: "camp_demo",
        sceneId: scene.id,
        userIds,
        scenes: 100,
        actors: 200,
        chatMessages: state.chat.length,
        rolls: 2000,
        activeSceneTokens: 50,
        publicActiveSceneTokens: 49,
        map: {
          width,
          height,
          encodedBytes: bytes.length,
          decodedRgbaBytes: width * height * 4,
          sha256: asset.checksum,
          source:
            "Deterministic generated stone texture and room outlines; no equivalence claim to illustrated map artwork",
        },
      },
      null,
      2,
    ),
  );
}

async function serveBuiltWeb(): Promise<void> {
  const webRequire = createRequire(resolve("apps/web/package.json"));
  const viteCli = resolve(
    webRequire.resolve("vite/package.json"),
    "..",
    "bin",
    "vite.js",
  );
  const launch = (args: string[]) =>
    spawn(process.execPath, [viteCli, ...args], {
      cwd: resolve("apps/web"),
      shell: false,
      stdio: "inherit",
      env: { ...fixtureEnv, NODE_ENV: "production" },
    });
  const build = launch(["build", "--outDir", webRoot, "--emptyOutDir"]);
  const code = await new Promise<number | null>((done) =>
    build.once("exit", done),
  );
  if (code !== 0) process.exit(code ?? 1);
  const child = launch([
    "preview",
    "--outDir",
    webRoot,
    "--host",
    "127.0.0.1",
    "--port",
    String(webPort),
    "--strictPort",
  ]);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      child.kill("SIGTERM");
    });
  child.once("exit", (exitCode) => process.exit(exitCode ?? 0));
}
