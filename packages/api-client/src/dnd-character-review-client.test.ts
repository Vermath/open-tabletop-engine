import type { DndCharacterReviewEntry, DndCharacterReviewListResponse } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient D&D character reviews", () => {
  it("encodes review routes and carries idempotency keys on every mutation", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({ policy: { mode: "optional", configured: false }, campaignUpdatedAt: "2026-07-13T00:00:00.000Z", entries: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    const list = client.dndCharacterReviews("campaign/one");
    await client.updateDndCharacterReviewPolicy("campaign/one", { mode: "required", expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z" }, "policy-key");
    const submit = client.submitDndCharacterReview("campaign/one", "actor/one", { expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z", expectedItemUpdatedAt: {} }, "submit-key");
    await client.decideDndCharacterReview("campaign/one", "actor/one", { action: "approve", expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z", expectedFingerprint: "sha256:reviewed" }, "decision-key");
    expectTypeOf(list).toEqualTypeOf<Promise<DndCharacterReviewListResponse>>();
    expectTypeOf(submit).toEqualTypeOf<Promise<DndCharacterReviewEntry>>();
    await Promise.all([list, submit]);

    expect(captured.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([null, "policy-key", "submit-key", "decision-key"]);
    expect(captured.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/v1/campaigns/campaign%2Fone/dnd/character-reviews",
      "/api/v1/campaigns/campaign%2Fone/dnd/character-review-policy",
      "/api/v1/campaigns/campaign%2Fone/dnd/character-reviews/actor%2Fone/submit",
      "/api/v1/campaigns/campaign%2Fone/dnd/character-reviews/actor%2Fone/decision",
    ]);
  });
});
