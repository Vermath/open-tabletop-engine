import { describe, expect, it } from "vitest";
import { OpenTabletopClient, type PlayerPreviewResponse } from "./index.js";

describe("player preview client", () => {
  it("encodes both identities and returns the minimized read-only projection", async () => {
    const response = {
      readOnly: true,
      player: { id: "player/?&=", displayName: "Player" },
      snapshot: {
        campaign: { id: "campaign", name: "Campaign" },
        selectedSceneId: "scene/?&=",
        generatedAt: "2026-09-06T07:00:00.000Z",
        scenes: [], tokens: [], actors: [], assets: [], chat: [], handouts: [], combats: [],
      },
    } satisfies PlayerPreviewResponse;
    let url: URL | undefined;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL) => {
        url = new URL(input.toString());
        return new Response(JSON.stringify(response), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const result: PlayerPreviewResponse = await client.scenePlayerPreview("scene/?&=", "player/?&=");

    expect(url?.pathname).toBe("/api/v1/scenes/scene%2F%3F%26%3D/player-preview");
    expect([...url!.searchParams]).toEqual([["userId", "player/?&="]]);
    expect(result).toEqual(response);
  });
});
