import { describe, expect, expectTypeOf, it } from "vitest";
import { OpenTabletopClient, type CampaignSystemBindingInput, type CampaignSystemBindingResult, type DeclarativeActionRequest, type DeclarativeActionResult, type DeclarativeActorSheet, type SystemActorSheet } from "./index.js";

const identity = { systemId: "lantern-survey", version: "1.0.0", checksum: "a".repeat(64) };
const revision = "2026-09-06T12:00:00.000Z";
function captureClient(response: unknown = {}) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const client = new OpenTabletopClient("https://api.test", {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: new URL(input.toString()), init });
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  return { client, requests };
}

describe("declarative system client", () => {
  it("sends the exact campaign revision and nullable previous binding with a replay key", async () => {
    const { client, requests } = captureClient({ binding: identity });
    const input: CampaignSystemBindingInput = { expectedUpdatedAt: revision, system: identity, expectedBinding: null };
    const result = await client.bindCampaignSystem("campaign/one", identity.systemId, input, { idempotencyKey: "binding-1" });
    expectTypeOf(result).toEqualTypeOf<CampaignSystemBindingResult>();
    expect(requests[0]?.url.pathname).toBe("/api/v1/campaigns/campaign%2Fone/systems/lantern-survey/binding");
    expect(JSON.parse(requests[0]!.init!.body as string)).toEqual(input);
    expect(new Headers(requests[0]?.init?.headers).get("Idempotency-Key")).toBe("binding-1");
    expect(result.binding).toEqual(identity);
  });

  it("uses the existing roll route with typed exact system and actor revisions", async () => {
    const { client, requests } = captureClient();
    const input: DeclarativeActionRequest = { rollId: "survey", expectedActorUpdatedAt: revision, expectedSystem: identity };
    const result = await client.rollDeclarativeSystemActor("campaign/one", identity.systemId, "actor?one", input, { idempotencyKey: "roll-1" });
    const throughExistingMethod = await client.rollSystemActor("campaign/one", identity.systemId, "actor?one", input, { idempotencyKey: "roll-1" });
    expectTypeOf(result).toEqualTypeOf<DeclarativeActionResult>();
    expectTypeOf(throughExistingMethod).toEqualTypeOf<DeclarativeActionResult>();
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url.pathname).toBe("/api/v1/campaigns/campaign%2Fone/systems/lantern-survey/actors/actor%3Fone/roll");
      expect(JSON.parse(request.init!.body as string)).toEqual(input);
      expect(new Headers(request.init?.headers).get("Idempotency-Key")).toBe("roll-1");
    }
  });

  it("returns a discriminated declarative actor sheet", async () => {
    const sheet: DeclarativeActorSheet = { kind: "declarative-v1", actorId: "actor", actorUpdatedAt: revision, system: identity, fields: [], quickRolls: [] };
    const { client } = captureClient(sheet);
    const result = await client.systemActorSheet("campaign", identity.systemId, "actor");
    expectTypeOf(result).toEqualTypeOf<SystemActorSheet>();
    if (result.kind === "declarative-v1") expectTypeOf(result).toEqualTypeOf<DeclarativeActorSheet>();
    expect(result).toEqual(sheet);
  });

  it("rejects missing revisions, replay keys, and mismatched identities before dispatch", async () => {
    const { client, requests } = captureClient();
    const binding = { expectedUpdatedAt: revision, system: identity, expectedBinding: null };
    const roll = { rollId: "survey", expectedActorUpdatedAt: revision, expectedSystem: identity };
    await expect(client.bindCampaignSystem("campaign", identity.systemId, { ...binding, expectedUpdatedAt: " " }, { idempotencyKey: "key" })).rejects.toThrow("exact campaign revision");
    await expect(client.bindCampaignSystem("campaign", identity.systemId, binding, { idempotencyKey: " " })).rejects.toThrow("Idempotency-Key");
    await expect(client.bindCampaignSystem("campaign", "different", binding, { idempotencyKey: "key" })).rejects.toThrow("identity must match");
    await expect(client.rollDeclarativeSystemActor("campaign", identity.systemId, "actor", { ...roll, expectedActorUpdatedAt: "" }, { idempotencyKey: "key" })).rejects.toThrow("exact actor revision");
    await expect(client.rollDeclarativeSystemActor("campaign", identity.systemId, "actor", roll, { idempotencyKey: " " })).rejects.toThrow("Idempotency-Key");
    await expect(client.rollDeclarativeSystemActor("campaign", "different", "actor", roll, { idempotencyKey: "key" })).rejects.toThrow("identity must match");
    await expect(client.rollSystemActor("campaign", identity.systemId, "actor", { ...roll })).rejects.toThrow("Idempotency-Key");
    expect(requests).toHaveLength(0);
  });
});
