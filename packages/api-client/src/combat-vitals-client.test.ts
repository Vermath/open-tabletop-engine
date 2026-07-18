import type { Dnd5eSrdCombatVitalsMutationResult } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient D&D combat vitals", () => {
  it("uses the encoded route, sends exact revisions, and keeps retry identity in the header", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: input.toString(), init };
        return new Response(JSON.stringify({
          actor: {},
          combat: {},
          adjustment: { kind: "healing", pool: "hp", requestedAmount: 4, appliedAmount: 4, before: 0, after: 4, max: 12, recoveredFromZero: true },
          rulesMutationId: "drmut_1",
          undo: { mutationId: "drmut_1", expectedActorUpdatedAt: {}, expectedItemUpdatedAt: {}, expectedCombatUpdatedAt: "2026-07-17T00:00:01.000Z" },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const command = {
      kind: "healing" as const,
      amount: 4,
      expectedActorUpdatedAt: "2026-07-17T00:00:00.000Z",
      expectedCombatUpdatedAt: "2026-07-17T00:00:00.000Z",
    };

    const result = client.adjustDnd5eSrdCombatVitals("campaign/one", "dnd 5e", "actor/two", command, "combat-vitals-1");
    expectTypeOf(result).toEqualTypeOf<Promise<Dnd5eSrdCombatVitalsMutationResult>>();
    await result;

    expect(captured?.url).toBe("https://api.test/api/v1/campaigns/campaign%2Fone/systems/dnd%205e/actors/actor%2Ftwo/combat-vitals");
    expect(captured?.init?.method).toBe("POST");
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe("combat-vitals-1");
    expect(captured?.init?.body).toBe(JSON.stringify(command));
  });

  it("rejects a blank retry identity before issuing a request", async () => {
    let requested = false;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async () => {
        requested = true;
        return new Response("{}");
      }) as typeof fetch,
    });

    await expect(client.adjustDnd5eSrdCombatVitals("campaign", "dnd-5e-srd", "actor", {
      kind: "temporaryHitPoints",
      amount: 5,
      expectedActorUpdatedAt: "2026-07-17T00:00:00.000Z",
    }, "   ")).rejects.toThrow("Idempotency-Key");
    expect(requested).toBe(false);
  });
});
