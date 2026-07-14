import type {
  DndControlledCreatureCreateRequest,
  DndControlledCreatureMutationResult,
  DndControlledCreaturePreview,
  DndControlledCreatureRevisionSet,
} from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { OpenTabletopClient } from "./index.js";

const revisions: DndControlledCreatureRevisionSet = { actors: {}, items: {}, tokens: {}, combats: {}, scenes: {}, encounters: {} };
const request: DndControlledCreatureCreateRequest = {
  kind: "summon",
  sceneId: "scene/one",
  source: { kind: "spell", actorId: "actor/source", itemId: "item/spell", name: "Summon", systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1" },
  controllerUserId: "user",
  controllerActorId: "actor/source",
  ownerUserId: "user",
  actor: { name: "Spirit", type: "summon", data: { hp: { current: 1, max: 1 }, rulesVersion: "SRD 5.2.1" } },
  token: { x: 0, y: 0, width: 50, height: 50, disposition: "friendly" },
  duration: { mode: "until_dismissed" },
  initiative: { mode: "independent" },
  command: { required: true, action: "bonus_action" },
};

describe("OpenTabletopClient controlled creatures", () => {
  it("uses encoded routes and idempotency headers for every state change", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    await client.systemControlledCreatures("campaign/one", "dnd/5.5e");
    const preview = client.previewSystemControlledCreature("campaign/one", "dnd/5.5e", request);
    const confirm = client.confirmSystemControlledCreature("campaign/one", "dnd/5.5e", { request, previewToken: "reviewed", expectedUpdatedAt: revisions }, "confirm-key");
    await client.commandSystemControlledCreature("campaign/one", "dnd/5.5e", "actor/one", { expectedUpdatedAt: revisions }, "command-key");
    await client.endSystemControlledCreature("campaign/one", "dnd/5.5e", "actor/one", { reason: "dismissed", expectedUpdatedAt: revisions }, "end-key");
    await client.endSystemControlledCreatureConcentration("campaign/one", "dnd/5.5e", { sourceActorId: "actor/source", groupId: "spell/group", expectedUpdatedAt: revisions }, "concentration-key");
    expectTypeOf(preview).toEqualTypeOf<Promise<DndControlledCreaturePreview>>();
    expectTypeOf(confirm).toEqualTypeOf<Promise<DndControlledCreatureMutationResult>>();
    await Promise.all([preview, confirm]);

    expect(captured.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([null, null, "confirm-key", "command-key", "end-key", "concentration-key"]);
    expect(captured.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/preview",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/actor%2Fone/command",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/actor%2Fone/end",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/concentration/end",
    ]);
  });
});
