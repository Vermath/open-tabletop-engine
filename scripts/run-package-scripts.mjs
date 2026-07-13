import { spawn } from "node:child_process";
import {
  packageManagerCommand,
  packageManagerEnvironment,
} from "./package-manager-command.mjs";

const scripts = process.argv.slice(2);
if (scripts.length === 0)
  throw new Error("Provide at least one package script to run.");
const environment = packageManagerEnvironment();

try {
  for (const script of scripts) {
    const status = await runScript(script);
    if (status !== 0) {
      process.exitCode = status;
      break;
    }
  }
} finally {
  environment.cleanup();
}

function runScript(script) {
  const command = packageManagerCommand(["run", script]);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      stdio: "inherit",
      shell: false,
      env: environment.env,
    });
    const forwardInterrupt = () => {
      child.kill("SIGINT");
      environment.cleanup();
    };
    const forwardTermination = () => {
      child.kill("SIGTERM");
      environment.cleanup();
    };
    process.once("SIGINT", forwardInterrupt);
    process.once("SIGTERM", forwardTermination);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTermination);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
