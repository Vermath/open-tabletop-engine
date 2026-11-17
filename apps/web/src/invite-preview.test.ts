import { describe, expect, it, vi } from "vitest";
import type { InvitePreviewInfo } from "./api.js";
import { startInvitePreviewLoad, type InvitePreviewState } from "./invite-preview.js";

vi.mock("./api.js", () => ({ loadInvitePreview: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function preview(name: string): InvitePreviewInfo {
  return {
    campaign: { id: name, name, description: "" },
    invite: { id: `invite-${name}`, campaignId: name, role: "player", invitedByUserId: "gm", status: "pending", expiresAt: "2026-10-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
    expectedUpdatedAt: "2026-09-01T00:00:00Z"
  };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("invitation preview request ownership", () => {
  it("keeps the current campaign when an old token's response arrives last, even if the transport ignores abort", async () => {
    const oldRequest = deferred<InvitePreviewInfo>();
    const newRequest = deferred<InvitePreviewInfo>();
    const load = vi.fn((token: string) => token === "oti_old" ? oldRequest.promise : newRequest.promise);
    const states: InvitePreviewState[] = [];
    const publish = (state: InvitePreviewState) => states.push(state);
    const stopOld = startInvitePreviewLoad("oti_old", publish, load);
    stopOld();
    const stopNew = startInvitePreviewLoad("oti_new", publish, load);

    newRequest.resolve(preview("Current campaign"));
    await settle();
    oldRequest.resolve(preview("Wrong campaign"));
    await settle();

    expect(states.at(-1)?.preview?.campaign.name).toBe("Current campaign");
    expect(states.some((state) => state.preview?.campaign.name === "Wrong campaign")).toBe(false);
    stopNew();
  });

  it("does not replace a current invite with a failure from a previous token", async () => {
    const oldRequest = deferred<InvitePreviewInfo>();
    const newRequest = deferred<InvitePreviewInfo>();
    let state: InvitePreviewState | undefined;
    const publish = (next: InvitePreviewState) => { state = next; };
    const stopOld = startInvitePreviewLoad("oti_old", publish, () => oldRequest.promise);
    stopOld();
    const stopNew = startInvitePreviewLoad("oti_new", publish, () => newRequest.promise);
    newRequest.resolve(preview("Current campaign"));
    await settle();
    oldRequest.reject(new Error("Old token expired"));
    await settle();

    expect(state?.preview?.campaign.name).toBe("Current campaign");
    expect(state?.error).toBeUndefined();
    stopNew();
  });

  it("does not publish pending results after the invite form is closed", async () => {
    const request = deferred<InvitePreviewInfo>();
    const publish = vi.fn();
    const stop = startInvitePreviewLoad("oti_closing", publish, () => request.promise);
    publish.mockClear();
    stop();
    request.resolve(preview("Closed campaign"));
    await settle();

    expect(publish).not.toHaveBeenCalled();
  });
});
