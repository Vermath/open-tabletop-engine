import { describe, expect, it, vi } from "vitest";
import { workspaceSelectionMatches } from "./realtime-refresh.js";
import { settleWorkspaceLoreLoad } from "./workspace-lore-load.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("settleWorkspaceLoreLoad", () => {
  it("commits a result while the requesting workspace remains selected", async () => {
    const pending = deferred<string[]>();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const completion = settleWorkspaceLoreLoad(pending.promise, () => true, onSuccess, onError);

    pending.resolve(["current world"]);
    await completion;

    expect(onSuccess).toHaveBeenCalledWith(["current world"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops success and error completions after selection changes but before effect cleanup", async () => {
    const requestedWorkspace = { campaignId: "campaign-a", userId: "user-a" };
    let selectedWorkspace = requestedWorkspace;
    const requestIsCurrent = () => workspaceSelectionMatches(requestedWorkspace, selectedWorkspace);
    const successPending = deferred<string[]>();
    const errorPending = deferred<string[]>();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const successCompletion = settleWorkspaceLoreLoad(successPending.promise, requestIsCurrent, onSuccess, onError);
    const errorCompletion = settleWorkspaceLoreLoad(errorPending.promise, requestIsCurrent, onSuccess, onError);

    selectedWorkspace = { campaignId: "campaign-b", userId: "user-a" };
    successPending.resolve(["stale world"]);
    errorPending.reject(new Error("stale handout failure"));
    await Promise.all([successCompletion, errorCompletion]);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
