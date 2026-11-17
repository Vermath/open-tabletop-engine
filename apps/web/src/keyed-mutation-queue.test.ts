import { describe, expect, it } from "vitest";
import { KeyedMutationQueue } from "./keyed-mutation-queue.js";

describe("KeyedMutationQueue", () => {
  it("persists back-to-back writes for one resource in order against the latest revision", async () => {
    const queue = new KeyedMutationQueue();
    const calls: string[] = [];
    let revision = "rev-1";
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const hpWrite = queue.enqueue("actor-1", async () => {
      calls.push(`hp:${revision}`);
      await firstCanFinish;
      revision = "rev-2";
    });
    const conditionWrite = queue.enqueue("actor-1", async () => {
      calls.push(`conditions:${revision}`);
      revision = "rev-3";
    });
    const debouncedStepperWrite = queue.enqueue("actor-1", async () => {
      calls.push(`stepper-hp:${revision}`);
      revision = "rev-4";
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["hp:rev-1"]);
    releaseFirst();
    await Promise.all([hpWrite, conditionWrite, debouncedStepperWrite]);
    expect(calls).toEqual(["hp:rev-1", "conditions:rev-2", "stepper-hp:rev-3"]);
    expect(revision).toBe("rev-4");
  });

  it("reports a rejected write to its caller without blocking the next queued edit", async () => {
    const queue = new KeyedMutationQueue();
    const rejected = queue.enqueue("actor-1", async () => {
      throw new Error("Actor sheet rejected");
    });
    const next = queue.enqueue("actor-1", async () => "persisted");

    await expect(rejected).rejects.toThrow("Actor sheet rejected");
    await expect(next).resolves.toBe("persisted");
  });
});
