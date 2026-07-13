import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageManagerRunner = fileURLToPath(
  new URL("../../../scripts/run-package-manager.mjs", import.meta.url),
);
const command =
  process.env.NODE_ENV === "production"
    ? { file: process.execPath, args: ["server.mjs"], shell: false }
    : {
        file: process.execPath,
        args: [packageManagerRunner, "exec", "vite", "--host", "0.0.0.0"],
        shell: false,
      };

const child = spawn(command.file, command.args, {
  stdio: "inherit",
  shell: command.shell,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
