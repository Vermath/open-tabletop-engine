import type { CalculationOverride, WorldRecord, WorldRelation } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { OpenTabletopClient, type CampaignSnapshot } from "./index.js";

const campaignId = "camp_client";
const actorId = "act_client";
const recordId = "wrec_client";
const relationId = "wrel_client";
const overrideId = "calc_override_client";
const revision = "2026-07-13T12:00:00.000Z";

interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body?: unknown;
}

function recordingClient(requests: CapturedRequest[]): OpenTabletopClient {
  return new OpenTabletopClient("https://api.example.test", {
    token: "ots_client",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        method: init?.method ?? "GET",
        url: new URL(input.toString()),
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
}

describe("OpenTabletopClient world graph and calculation override surface", () => {
  it("uses the public invite preview contract before guarded acceptance", async () => {
    const requests: CapturedRequest[] = [];
    const client = recordingClient(requests);
    await client.previewInvite("oti_token/with space");
    expect(`${requests[0]!.method} ${requests[0]!.url.pathname}${requests[0]!.url.search}`).toBe(
      "GET /api/v1/invites/preview?token=oti_token%2Fwith+space",
    );
  });

  it("exposes the additive snapshot collections with their public domain types", () => {
    expectTypeOf<CampaignSnapshot["worldRecords"]>().toEqualTypeOf<WorldRecord[]>();
    expectTypeOf<CampaignSnapshot["worldRelations"]>().toEqualTypeOf<WorldRelation[]>();
    expectTypeOf<CampaignSnapshot["calculationOverrides"]>().toEqualTypeOf<CalculationOverride[]>();
  });

  it("sends every mutation with a stable key and its exact campaign/resource revisions", async () => {
    const requests: CapturedRequest[] = [];
    const client = recordingClient(requests);

    await client.worldRecords(campaignId, { worldId: "world_client", kind: "npc", lifecycle: "active" });
    await client.createWorldRecord(campaignId, {
      kind: "npc",
      name: "Archivist",
      visibility: "gm_only",
      expectedCampaignUpdatedAt: revision,
    }, "world-record-create-client");
    await client.updateWorldRecord(recordId, { summary: "Updated", expectedUpdatedAt: revision }, "world-record-update-client");
    await client.setWorldRecordLifecycle(recordId, "resolved", revision, "world-record-lifecycle-client");
    await client.deleteWorldRecord(recordId, revision, "world-record-delete-client");
    await client.worldRelations(campaignId, { recordId, worldId: "world_client" });
    await client.createWorldRelation(campaignId, {
      sourceRecordId: recordId,
      targetRecordId: "wrec_target",
      type: "allied_with",
      expectedCampaignUpdatedAt: revision,
    }, "world-relation-create-client");
    await client.updateWorldRelation(relationId, { notes: "Updated", expectedUpdatedAt: revision }, "world-relation-update-client");
    await client.deleteWorldRelation(relationId, revision, "world-relation-delete-client");
    await client.calculationOverrides(campaignId, actorId);
    await client.createCalculationOverride(campaignId, actorId, {
      fieldId: "armor-class",
      source: "gm_manual",
      effectiveValue: 18,
      reason: "Documented ruling",
      expectedActorUpdatedAt: revision,
    }, "calculation-override-create-client");
    await client.clearCalculationOverride(overrideId, {
      reason: "Ruling expired",
      expectedUpdatedAt: revision,
      expectedActorUpdatedAt: revision,
    }, "calculation-override-clear-client");

    expect(requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)).toEqual([
      "GET /api/v1/campaigns/camp_client/world-records?worldId=world_client&kind=npc&lifecycle=active",
      "POST /api/v1/campaigns/camp_client/world-records",
      "PATCH /api/v1/world-records/wrec_client",
      "POST /api/v1/world-records/wrec_client/lifecycle",
      `DELETE /api/v1/world-records/wrec_client?expectedUpdatedAt=${encodeURIComponent(revision)}`,
      "GET /api/v1/campaigns/camp_client/world-relations?recordId=wrec_client&worldId=world_client",
      "POST /api/v1/campaigns/camp_client/world-relations",
      "PATCH /api/v1/world-relations/wrel_client",
      `DELETE /api/v1/world-relations/wrel_client?expectedUpdatedAt=${encodeURIComponent(revision)}`,
      "GET /api/v1/campaigns/camp_client/actors/act_client/calculation-overrides",
      "POST /api/v1/campaigns/camp_client/actors/act_client/calculation-overrides",
      "POST /api/v1/calculation-overrides/calc_override_client/clear",
    ]);

    const mutationIndexes = [1, 2, 3, 4, 6, 7, 8, 10, 11];
    expect(mutationIndexes.map((index) => requests[index]!.headers.get("idempotency-key"))).toEqual([
      "world-record-create-client",
      "world-record-update-client",
      "world-record-lifecycle-client",
      "world-record-delete-client",
      "world-relation-create-client",
      "world-relation-update-client",
      "world-relation-delete-client",
      "calculation-override-create-client",
      "calculation-override-clear-client",
    ]);
    expect(requests[1]!.body).toEqual(expect.objectContaining({ expectedCampaignUpdatedAt: revision }));
    expect(requests[2]!.body).toEqual(expect.objectContaining({ expectedUpdatedAt: revision }));
    expect(requests[3]!.body).toEqual({ lifecycle: "resolved", expectedUpdatedAt: revision });
    expect(requests[6]!.body).toEqual(expect.objectContaining({ expectedCampaignUpdatedAt: revision }));
    expect(requests[7]!.body).toEqual(expect.objectContaining({ expectedUpdatedAt: revision }));
    expect(requests[10]!.body).toEqual(expect.objectContaining({ expectedActorUpdatedAt: revision }));
    expect(requests[11]!.body).toEqual(expect.objectContaining({ expectedUpdatedAt: revision, expectedActorUpdatedAt: revision }));
  });

  it("rejects blank retry identities before any graph or ledger mutation reaches fetch", async () => {
    const requests: CapturedRequest[] = [];
    const client = recordingClient(requests);
    const attempts: Array<() => Promise<unknown>> = [
      () => client.createWorldRecord(campaignId, { kind: "npc", name: "NPC", expectedCampaignUpdatedAt: revision }, " "),
      () => client.updateWorldRecord(recordId, { name: "NPC", expectedUpdatedAt: revision }, ""),
      () => client.setWorldRecordLifecycle(recordId, "archived", revision, " "),
      () => client.deleteWorldRecord(recordId, revision, ""),
      () => client.createWorldRelation(campaignId, { sourceRecordId: recordId, targetRecordId: "wrec_target", type: "related_to", expectedCampaignUpdatedAt: revision }, " "),
      () => client.updateWorldRelation(relationId, { notes: "No", expectedUpdatedAt: revision }, ""),
      () => client.deleteWorldRelation(relationId, revision, " "),
      () => client.createCalculationOverride(campaignId, actorId, { fieldId: "armor-class", source: "house_rule", effectiveValue: 18, reason: "No", expectedActorUpdatedAt: revision }, ""),
      () => client.clearCalculationOverride(overrideId, { reason: "No", expectedUpdatedAt: revision, expectedActorUpdatedAt: revision }, " "),
    ];

    for (const attempt of attempts) await expect(attempt()).rejects.toThrow("Idempotency-Key");
    expect(requests).toEqual([]);
  });
});
