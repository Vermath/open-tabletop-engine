// Run from the repository root:
// pnpm --filter @open-tabletop/api exec tsx src/save-benchmark.ts
import { scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { FileStateStore, type StateStore } from "./store.js";

const demoPassword = "demo-password-123";
const iterations = {
  tokenMoves: 200,
  actorHpChanges: 100,
};

type StoreKind = "sqlite" | "file";
type FlushableStore = StateStore & { flush?: () => void; close?: () => void };
type SaveStats = { calls: number; durations: number[] };
type RouteResult = {
  route: string;
  count: number;
  total: Percentiles;
  save: Percentiles;
  everythingElse: Percentiles;
};
type Percentiles = { p50: number; p95: number; max: number };
type BenchmarkRequest = {
  url: string;
  headers: Record<string, string>;
  payload: object;
};

async function main() {
  for (const kind of ["sqlite", "file"] as const satisfies StoreKind[]) {
    await runForStore(kind);
  }
}

async function runForStore(kind: StoreKind) {
  const directory = mkdtempSync(join(tmpdir(), `otte-save-benchmark-${kind}-`));
  const store =
    kind === "sqlite"
      ? new SqliteStateStore(join(directory, "state.sqlite"))
      : new FileStateStore(join(directory, "state.json"));
  const saveStats = wrapSave(store);
  let app: FastifyInstance | undefined;
  try {
    seedDemoPassword(store);
    app = await buildApp({ store });
    const headers = await loginDemoUser(app);
    const token = store.state.tokens.find((item) => item.sceneId && item.layer !== "gm");
    const actor = store.state.actors.find((item) => item.id === token?.actorId) ?? store.state.actors[0];
    if (!token) throw new Error("No benchmark token found in seeded state");
    if (!actor) throw new Error("No benchmark actor found in seeded state");

    await warmUp(app, token.id, actor.id, headers);
    resetSaveStats(saveStats);

    const tokenRoute = await measureRoute({
      app,
      saveStats,
      count: iterations.tokenMoves,
      route: `PATCH /api/v1/tokens/${token.id}`,
      buildRequest: (index) => ({
        url: `/api/v1/tokens/${token.id}`,
        headers,
        payload: { x: token.x + (index % 20), y: token.y + Math.floor(index / 20) },
      }),
    });

    const actorRoute = await measureRoute({
      app,
      saveStats,
      count: iterations.actorHpChanges,
      route: `PATCH /api/v1/actors/${actor.id}`,
      buildRequest: (index) => ({
        url: `/api/v1/actors/${actor.id}`,
        headers,
        payload: { data: { ...actor.data, hp: { current: 1 + (index % 10), max: 20 } } },
      }),
    });

    const directSave = measureDirectSave(store, saveStats);
    const flush = measureOptionalFlush(store);

    printResult(kind, tokenRoute, actorRoute, directSave, flush);
  } finally {
    await app?.close();
    store.close?.();
    rmSync(directory, { recursive: true, force: true });
  }
}

function wrapSave(store: StateStore): SaveStats {
  const stats: SaveStats = { calls: 0, durations: [] };
  const originalSave = store.save.bind(store);
  store.save = () => {
    const start = performance.now();
    try {
      return originalSave();
    } finally {
      stats.calls += 1;
      stats.durations.push(performance.now() - start);
    }
  };
  return stats;
}

function resetSaveStats(stats: SaveStats): void {
  stats.calls = 0;
  stats.durations = [];
}

async function warmUp(app: FastifyInstance, tokenId: string, actorId: string, headers: Record<string, string>) {
  for (let index = 0; index < 20; index += 1) {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/tokens/${tokenId}`,
      headers,
      payload: { x: index, y: index },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/v1/actors/${actorId}`,
      headers,
      payload: { data: { hp: { current: 10, max: 20 } } },
    });
  }
}

async function measureRoute(options: {
  app: FastifyInstance;
  saveStats: SaveStats;
  count: number;
  route: string;
  buildRequest(index: number): BenchmarkRequest;
}): Promise<RouteResult> {
  const totals: number[] = [];
  const saveDurations: number[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const saveStartIndex = options.saveStats.durations.length;
    const start = performance.now();
    const request = options.buildRequest(index);
    const response = await options.app.inject().patch(request.url).headers(request.headers).payload(request.payload);
    totals.push(performance.now() - start);
    if (response.statusCode >= 400) {
      throw new Error(`${options.route} returned ${response.statusCode}: ${response.body}`);
    }
    const routeSaveDurations = options.saveStats.durations.slice(saveStartIndex);
    saveDurations.push(routeSaveDurations.reduce((total, duration) => total + duration, 0));
  }
  return {
    route: options.route,
    count: options.count,
    total: percentiles(totals),
    save: percentiles(saveDurations),
    everythingElse: percentiles(totals.map((total, index) => Math.max(0, total - (saveDurations[index] ?? 0)))),
  };
}

function measureDirectSave(store: StateStore, saveStats: SaveStats): Percentiles {
  const durations: number[] = [];
  resetSaveStats(saveStats);
  for (let index = 0; index < 50; index += 1) {
    const start = performance.now();
    store.save();
    durations.push(performance.now() - start);
  }
  return percentiles(durations);
}

function measureOptionalFlush(store: FlushableStore): Percentiles | undefined {
  if (typeof store.flush !== "function") return undefined;
  const durations: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    store.save();
    const start = performance.now();
    store.flush();
    durations.push(performance.now() - start);
  }
  return percentiles(durations);
}

function printResult(kind: StoreKind, tokenRoute: RouteResult, actorRoute: RouteResult, directSave: Percentiles, flush: Percentiles | undefined): void {
  console.log(`\n${kind.toUpperCase()} store`);
  printRoute(tokenRoute);
  printRoute(actorRoute);
  console.log(`direct store.save(): ${format(directSave)}`);
  if (flush) console.log(`dirty store.flush(): ${format(flush)}`);
}

function printRoute(result: RouteResult): void {
  console.log(`${result.route} (${result.count} sequential)`);
  console.log(`  total:          ${format(result.total)}`);
  console.log(`  save:           ${format(result.save)}`);
  console.log(`  everythingElse: ${format(result.everythingElse)}`);
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile));
  return sortedValues[index] ?? 0;
}

function format(value: Percentiles): string {
  return `p50=${value.p50.toFixed(2)}ms p95=${value.p95.toFixed(2)}ms max=${value.max.toFixed(2)}ms`;
}

function seedDemoPassword(store: StateStore): void {
  const user = store.state.users.find((item) => item.id === "usr_demo_gm");
  if (!user?.email) throw new Error("Demo GM user is missing from seeded state");
  const salt = "test-password-salt";
  user.passwordHash = `scrypt:${salt}:${scryptSync(demoPassword, salt, 32).toString("base64url")}`;
  user.passwordResetRequired = false;
  user.mfa = undefined;
}

async function loginDemoUser(app: FastifyInstance): Promise<Record<string, string>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "gm@example.test", password: demoPassword },
  });
  if (response.statusCode >= 400) {
    throw new Error(`Demo login returned ${response.statusCode}: ${response.body}`);
  }
  const body = response.json() as { token?: string };
  if (!body.token) throw new Error("Demo login did not return a session token");
  return { authorization: `Bearer ${body.token}` };
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
