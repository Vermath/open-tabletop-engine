import type { TokenMoveBatchResult } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient atomic token movement", () => {
  it("uses the encoded scene route and keeps retry identity out of the command body", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: input.toString(), init };
        return new Response(JSON.stringify({ tokens: [], movedAt: "2026-07-17T00:00:00.000Z", undo: { expectedSceneUpdatedAt: "2026-07-17T00:00:00.000Z", changes: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }) as typeof fetch
    });
    const command = {
      expectedSceneUpdatedAt: "2026-07-17T00:00:00.000Z",
      changes: [{ tokenId: "token/one", x: 40, y: 80, expectedUpdatedAt: "2026-07-17T00:00:00.000Z" }]
    };

    const result = client.moveTokens("scene/one", command, "move-batch-1");
    expectTypeOf(result).toEqualTypeOf<Promise<TokenMoveBatchResult>>();
    await result;

    expect(captured?.url).toBe("https://api.test/api/v1/scenes/scene%2Fone/tokens/move");
    expect(captured?.init?.method).toBe("POST");
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe("move-batch-1");
    expect(captured?.init?.body).toBe(JSON.stringify(command));
  });
});
