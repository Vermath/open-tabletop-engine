import { spawn } from "node:child_process";

const grandchild = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
  { stdio: "ignore" },
);

console.log(JSON.stringify({ grandchildPid: grandchild.pid }));
process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);
