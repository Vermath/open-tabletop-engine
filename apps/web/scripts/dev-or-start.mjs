import { spawn } from "node:child_process";
import process from "node:process";

const command = process.env.NODE_ENV === "production"
  ? { file: process.execPath, args: ["server.mjs"], shell: false }
  : { file: "pnpm", args: ["exec", "vite", "--host", "0.0.0.0"], shell: process.platform === "win32" };

const child = spawn(command.file, command.args, {
  stdio: "inherit",
  shell: command.shell
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
