import { describe, expect, it, vi } from "vitest";
import {
  settleWorkspaceBoundAction,
  type WorkspaceBoundRequest,
} from "./workspace-bound-action.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("workspace-bound actions", () => {
  it("aborts and ignores a delayed private item response after the active user changes", async () => {
    const pending = deferred<{
      id: string;
      name: string;
      data: { gmNotes: string };
    }>();
    const controller = new AbortController();
    const request: WorkspaceBoundRequest = {
      campaignId: "camp_demo",
      userId: "usr_demo_gm",
      campaignUpdatedAt: "2026-07-17T00:00:00.000Z",
      controller,
    };
    let activeIdentity = { campaignId: "camp_demo", userId: "usr_demo_gm" };
    const applied = vi.fn();
    const finish = vi.fn();

    const completion = settleWorkspaceBoundAction(
      request,
      (candidate) =>
        !candidate.controller.signal.aborted &&
        candidate.campaignId === activeIdentity.campaignId &&
        candidate.userId === activeIdentity.userId,
      () => pending.promise,
      applied,
      finish,
    );

    activeIdentity = { campaignId: "camp_demo", userId: "usr_demo_player" };
    controller.abort();
    pending.resolve({
      id: "itm_private",
      name: "GM-only relic",
      data: { gmNotes: "hidden vault code" },
    });
    await completion;

    expect(controller.signal.aborted).toBe(true);
    expect(applied).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledExactlyOnceWith(request);
  });
});
