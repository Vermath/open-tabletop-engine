import type {
  Dnd5eSrdSpellPreparationMutationResult,
  Dnd5eSrdSpellPreparationPreviewRequest,
  Dnd5eSrdSpellPreparationPreviewResponse,
} from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient D&D spell preparation", () => {
  it("uses encoded preview/apply routes with exact revisions and replay keys", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: input.toString(), init });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const previewInput: Dnd5eSrdSpellPreparationPreviewRequest = {
      selectedSpellIds: ["item/one"],
      timing: "long-rest",
      expectedActorUpdatedAt: "2026-07-13T12:00:00.000Z",
      expectedItemUpdatedAt: { "item/one": "2026-07-13T12:00:00.000Z" },
    };

    const preview = client.previewDnd5eSrdSpellPreparation(
      "campaign/one",
      "dnd/5.5e",
      "actor?one",
      previewInput,
      "preview-key",
    );
    const apply = client.applyDnd5eSrdSpellPreparation(
      "campaign/one",
      "dnd/5.5e",
      "actor?one",
      {
        preparedPreviewKey: "preview-key",
        expectedActorUpdatedAt: previewInput.expectedActorUpdatedAt,
        expectedItemUpdatedAt: previewInput.expectedItemUpdatedAt,
      },
      "apply-key",
    );
    expectTypeOf(preview).toEqualTypeOf<Promise<Dnd5eSrdSpellPreparationPreviewResponse>>();
    expectTypeOf(apply).toEqualTypeOf<Promise<Dnd5eSrdSpellPreparationMutationResult>>();
    await Promise.all([preview, apply]);

    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%3Fone/spell-preparation/preview",
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%3Fone/spell-preparation/apply",
    ]);
    expect(requests.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      "preview-key",
      "apply-key",
    ]);
    expect(requests.map(({ init }) => JSON.parse(String(init?.body)))).toEqual([
      previewInput,
      {
        preparedPreviewKey: "preview-key",
        expectedActorUpdatedAt: previewInput.expectedActorUpdatedAt,
        expectedItemUpdatedAt: previewInput.expectedItemUpdatedAt,
      },
    ]);
  });
});
