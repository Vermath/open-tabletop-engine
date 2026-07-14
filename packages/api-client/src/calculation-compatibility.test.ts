import type { ActorCalculationExplanation, CampaignCompatibilityReport } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient calculation and compatibility reads", () => {
  it("uses encoded contract routes and preserves response types", async () => {
    const requests: string[] = [];
    const fetchMock = (async (input: RequestInfo | URL) => {
      requests.push(new URL(input.toString()).pathname);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = new OpenTabletopClient("https://api.test", { fetch: fetchMock });

    const compatibility = client.campaignCompatibility("campaign/one");
    const explanation = client.systemActorCalculationExplanation("campaign/one", "dnd/5.5e", "actor/one");
    expectTypeOf(compatibility).toEqualTypeOf<Promise<CampaignCompatibilityReport>>();
    expectTypeOf(explanation).toEqualTypeOf<Promise<ActorCalculationExplanation>>();
    await Promise.all([compatibility, explanation]);

    expect(requests).toEqual([
      "/api/v1/campaigns/campaign%2Fone/compatibility",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%2Fone/calculation-explanation",
    ]);
  });
});
