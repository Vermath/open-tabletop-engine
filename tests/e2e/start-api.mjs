import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const apiPort = process.env.OTTE_E2E_API_PORT ?? "4100";
const dbPath = resolve(process.cwd(), "storage", `e2e-${apiPort}.sqlite`);

for (const suffix of ["", "-shm", "-wal"]) {
  rmSync(`${dbPath}${suffix}`, { force: true, maxRetries: 5, retryDelay: 100 });
}

const packageManagerArgs = [
  "--filter",
  "@open-tabletop/api",
  "exec",
  "tsx",
  "src/server.ts",
];
const child = spawn(
  process.execPath,
  ["scripts/run-package-manager.mjs", ...packageManagerArgs],
  {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: apiPort,
      OTTE_SQLITE_PATH: dbPath,
      OTTE_DEMO_SEED: process.env.OTTE_DEMO_SEED ?? "true",
      OTTE_AI_PROVIDER: process.env.OTTE_AI_PROVIDER ?? "codex-loopback",
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});
