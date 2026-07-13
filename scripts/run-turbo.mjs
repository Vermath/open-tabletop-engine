import { spawn } from "node:child_process";
import { join } from "node:path";
import { packageManagerEnvironment } from "./package-manager-command.mjs";

const environment = packageManagerEnvironment();
const turboEntrypoint = join(
  process.cwd(),
  "node_modules",
  "turbo",
  "bin",
  "turbo",
);
const child = spawn(
  process.execPath,
  [turboEntrypoint, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: false,
    env: environment.env,
  },
);
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
  console.error("Failed to start Turbo.", error);
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
