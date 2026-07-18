import { relative } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, vi } from "vitest";
import { TestFixtureRegistry } from "./test-fixture-lifecycle.js";
import {
  activeResourceSnapshot,
  createTestTimeoutDiagnostic,
  failureLooksTimedOut,
  formatTestTimeoutDiagnostic
} from "./test-resource-diagnostics.js";

const fixtureCloseTimeoutMs = 2_000;
const appFixtures = new TestFixtureRegistry<FastifyInstance>();

vi.mock("./app.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./app.js")>();
  return {
    ...actual,
    buildApp: async (...args: Parameters<typeof actual.buildApp>) => {
      const app = appFixtures.track(await actual.buildApp(...args), "fastify-app");
      app.addHook("onClose", async () => appFixtures.release(app));
      return app;
    }
  };
});

beforeEach((context) => {
  const baseline = activeResourceSnapshot();
  const startedAtMs = Date.now();
  let emitted = false;
  const emit = () => {
    if (emitted) return;
    emitted = true;
    const file = relative(process.cwd(), context.task.file.filepath);
    console.error(formatTestTimeoutDiagnostic(createTestTimeoutDiagnostic({
      file,
      test: context.task.name,
      startedAtMs,
      timeoutMs: context.task.timeout,
      signalAborted: context.signal.aborted,
      baseline
    })));
  };
  context.signal.addEventListener("abort", emit, { once: true });
  context.onTestFailed((failedContext) => {
    if (failureLooksTimedOut(failedContext.task.result?.errors)) emit();
  });
});

afterEach(async (context) => {
  const leaked = appFixtures.pendingLabels();
  if (leaked.length === 0) return;
  const cleanup = await appFixtures.closeAll(fixtureCloseTimeoutMs);
  const summary = JSON.stringify({ kind: "fixture_cleanup", leaked, ...cleanup });
  console.error(`OTTE_TEST_FIXTURE_CLEANUP ${summary}`);
  if ((context.task.result?.errors?.length ?? 0) > 0) {
    return;
  }
  throw new Error(`Test left application fixtures open: ${summary}`);
}, fixtureCloseTimeoutMs + 500);
