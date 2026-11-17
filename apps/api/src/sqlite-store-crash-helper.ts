import {
  SqliteStateStore,
  type SqliteRestoreFaultPhase,
} from "./sqlite-store.js";

const [
  databasePath,
  backupFileName,
  expectedStateRevision,
  faultPhase,
  recoveryAdminUserId,
] = process.argv.slice(2);
const phases = new Set<SqliteRestoreFaultPhase>([
  "after_intent_recorded",
  "after_stage",
  "after_live_renamed",
  "after_candidate_promoted",
  "after_candidate_open",
  "after_candidate_migrate",
  "after_candidate_load",
  "after_reconciliation",
  "after_commit_recorded",
  "after_rollback_recorded",
]);

if (
  !databasePath ||
  !backupFileName ||
  !expectedStateRevision ||
  !faultPhase ||
  !phases.has(faultPhase as SqliteRestoreFaultPhase)
) {
  throw new Error(
    "Usage: sqlite-store-crash-helper <database> <backup> <revision> <fault-phase> [recovery-admin]",
  );
}

const store = new SqliteStateStore(databasePath, {
  seedDemo: false,
  restoreFaultInjector(phase) {
    if (
      faultPhase === "after_rollback_recorded" &&
      phase === "after_live_renamed"
    ) {
      throw new Error("drive restore into its durable rollback path");
    }
    if (phase === faultPhase) process.exit(86);
  },
});

try {
  const actualStateRevision = store.storageOperations().restoreStateRevision;
  const result = store.restoreBackup({
    backupFileName,
    expectedStateRevision,
    ...(recoveryAdminUserId ? { recoveryAdminUserId } : {}),
  });
  process.stderr.write(
    `restore did not reach injected crash phase (expected ${expectedStateRevision}, actual ${actualStateRevision}): ${JSON.stringify(result)}\n`,
  );
  process.exitCode = 87;
} finally {
  store.close();
}
