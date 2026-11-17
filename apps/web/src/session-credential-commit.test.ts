import { describe, expect, it, vi } from "vitest";
import { SessionCredentialCommitQueue } from "./session-credential-commit.js";

describe("SessionCredentialCommitQueue", () => {
  it("serializes credential activation and lets the newest request own the final commit", async () => {
    const queue = new SessionCredentialCommitQueue();
    const releases: Array<() => void> = [];
    const events: string[] = [];

    const firstTicket = queue.begin();
    const first = queue.run(firstTicket, async (isCurrent) => {
      events.push("activate:first");
      await new Promise<void>((resolve) => releases.push(resolve));
      if (isCurrent()) events.push("commit:first");
    });
    await Promise.resolve();

    const secondTicket = queue.begin();
    const second = queue.run(secondTicket, async (isCurrent) => {
      events.push("activate:second");
      await new Promise<void>((resolve) => releases.push(resolve));
      if (isCurrent()) events.push("commit:second");
    });

    releases.shift()!();
    await first;
    await Promise.resolve();
    releases.shift()!();
    await second;

    expect(events).toEqual(["activate:first", "activate:second", "commit:second"]);
  });

  it("drops queued commits after local sign-out invalidates them", async () => {
    const queue = new SessionCredentialCommitQueue();
    const ticket = queue.begin();
    queue.invalidate();
    const operation = vi.fn(async () => undefined);
    await expect(queue.run(ticket, operation)).resolves.toBeUndefined();
    expect(operation).not.toHaveBeenCalled();
  });
});
