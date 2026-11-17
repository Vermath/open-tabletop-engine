import { spawn, spawnSync } from "node:child_process";

/** Start each POSIX gate in a new process group so a timeout can reach every descendant. */
export function spawnGateProcess(executable, args, options = {}) {
  return spawn(executable, args, {
    ...options,
    shell: false,
    detached: process.platform !== "win32",
  });
}

/**
 * Stop a gate and all of its descendants. The promise settles only after the
 * forced-kill deadline, preventing the recorder from overlapping a timed-out
 * process tree with the next gate.
 */
export function terminateGateProcessTree(child, { forceAfterMs = 5_000 } = {}) {
  if (!child.pid) return Promise.resolve();
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return Promise.resolve();
  }

  const processGroupId = child.pid;
  try {
    signalProcessGroup(processGroupId, "SIGTERM");
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    setTimeout(() => {
      try {
        signalProcessGroup(processGroupId, "SIGKILL");
        resolvePromise();
      } catch (error) {
        rejectPromise(error);
      }
    }, forceAfterMs);
  });
}

function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}
