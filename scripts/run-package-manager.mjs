import { spawn } from "node:child_process";
import {
  packageManagerCommand,
  packageManagerEnvironment,
} from "./package-manager-command.mjs";

const packageManagerArgs = process.argv.slice(2);
const command = packageManagerCommand(packageManagerArgs);
// `pnpm exec` launches a binary directly and cannot enter another package
// lifecycle. Avoid a temporary PATH shim for long-lived dev/test servers,
// because Windows process-tree teardown may not deliver a cleanup signal.
const environment = packageManagerArgs.includes("exec")
  ? { env: process.env, cleanup() {} }
  : packageManagerEnvironment();
const child = spawn(command.executable, command.args, {
  stdio: "inherit",
  shell: false,
  env: environment.env,
});
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  environment.cleanup();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    child.kill(signal);
    cleanup();
  });
}
process.once("exit", cleanup);

child.once("error", (error) => {
  console.error("Failed to start the repository package manager.", error);
  process.exitCode = 1;
  cleanup();
});
child.once("exit", (code, signal) => {
  if (signal && process.platform !== "win32") {
    cleanup();
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
child.once("close", cleanup);
