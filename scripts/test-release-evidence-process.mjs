import { strictEqual } from "node:assert";
import { once } from "node:events";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  spawnGateProcess,
  terminateGateProcessTree,
} from "./release-evidence-process.mjs";

if (process.platform !== "win32") {
  const repoRoot = process.cwd();
  const fixture = spawnGateProcess(
    process.execPath,
    [
      join(
        repoRoot,
        "scripts",
        "fixtures",
        "release-evidence-process-tree.mjs",
      ),
    ],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] },
  );
  const leaderPid = fixture.pid;
  const closed = once(fixture, "close");
  try {
    const lines = createInterface({ input: fixture.stdout });
    const [line] = await withTimeout(
      once(lines, "line"),
      2_000,
      "fixture startup",
    );
    const { grandchildPid } = JSON.parse(line);
    strictEqual(Number.isSafeInteger(grandchildPid), true);
    process.kill(grandchildPid, 0);
    await terminateGateProcessTree(fixture, { forceAfterMs: 50 });
    await withTimeout(closed, 2_000, "process-tree shutdown");
    await waitForProcessExit(-leaderPid, "process group");
    await waitForProcessExit(grandchildPid, "grandchild");
  } finally {
    try {
      process.kill(-leaderPid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

async function waitForProcessExit(target, label) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      process.kill(target, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`${label} ${target} survived process-tree termination`);
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} exceeded ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}
