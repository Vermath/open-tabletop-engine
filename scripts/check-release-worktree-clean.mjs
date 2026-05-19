import { releaseWorktreeFailureMessage, releaseWorktreeStatus } from "./release-worktree-clean.mjs";

const status = releaseWorktreeStatus();

if (!status.ok) {
  console.error(releaseWorktreeFailureMessage(status));
  process.exit(1);
}

if (status.allowDirty && status.dirtyEntries.length > 0) {
  console.log(`Release worktree check skipped by OTTE_ALLOW_DIRTY_RELEASE_AUDIT=true for ${status.commit}.`);
} else {
  console.log(`Release worktree is clean for ${status.commit}.`);
}
