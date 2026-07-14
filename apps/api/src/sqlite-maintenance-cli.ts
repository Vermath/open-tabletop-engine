#!/usr/bin/env node
import {
  parseSqliteMaintenanceArgs,
  runSqliteMaintenance,
  sqliteMaintenanceHelp
} from "./sqlite-maintenance.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${sqliteMaintenanceHelp}\n`);
} else {
  try {
    const result = runSqliteMaintenance(parseSqliteMaintenanceArgs(args));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    const operation = result.command === "drill"
      ? result.drill
      : result.command === "restore"
        ? result.restore
        : undefined;
    if (operation?.status === "failed") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
