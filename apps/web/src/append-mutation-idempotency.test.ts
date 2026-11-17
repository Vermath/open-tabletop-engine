import { describe, expect, it } from "vitest";
import { appendMutationAttemptForIntent, appendMutationFingerprint } from "./append-mutation-idempotency.js";

describe("append mutation idempotency", () => {
  it("reuses a key only while retrying the same submit intent", () => {
    let created = 0;
    const first = appendMutationAttemptForIntent(undefined, "chat", appendMutationFingerprint({ body: "Hello" }), () => String(++created));
    const retry = appendMutationAttemptForIntent(first, "chat", appendMutationFingerprint({ body: "Hello" }), () => String(++created));
    const corrected = appendMutationAttemptForIntent(first, "chat", appendMutationFingerprint({ body: "Hello!" }), () => String(++created));

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe("append:chat:1");
    expect(corrected.idempotencyKey).toBe("append:chat:2");
  });
});
