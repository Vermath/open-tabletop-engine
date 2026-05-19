import { execFileSync } from "node:child_process";

export function releaseWorktreeStatus(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const allowDirty = options.allowDirty ?? process.env.OTTE_ALLOW_DIRTY_RELEASE_AUDIT === "true";
  const commit = options.commit ?? git(["rev-parse", "HEAD"], cwd);
  const status = git(["status", "--porcelain=v1"], cwd);
  const dirtyEntries = status.split(/\r?\n/).filter(Boolean);
  return {
    ok: allowDirty || dirtyEntries.length === 0,
    allowDirty,
    commit,
    dirtyEntries
  };
}

export function releaseWorktreeFailureMessage(status) {
  const dirtyPreview = status.dirtyEntries.slice(0, 20).map((entry) => `  - ${entry}`).join("\n");
  const omitted = status.dirtyEntries.length > 20 ? `\n  ... ${status.dirtyEntries.length - 20} more` : "";
  return [
    "Release audit requires a clean git worktree so evidence cannot be mixed with uncommitted files.",
    `Release commit: ${status.commit}`,
    "Dirty paths:",
    dirtyPreview || "  - <none>",
    omitted,
    "Commit or stash the changes before release acceptance, or set OTTE_ALLOW_DIRTY_RELEASE_AUDIT=true only for non-release fixture tests."
  ].filter(Boolean).join("\n");
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
