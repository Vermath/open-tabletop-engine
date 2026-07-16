import { openApiSpec } from "@open-tabletop/api-contracts";
import type { CampaignPresence } from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  OpenTabletopClient,
  type CampaignCreateInput,
  type CampaignSearchResult,
  type CampaignSnapshot,
  type CampaignSnapshotBundled,
  type CampaignSnapshotMember,
  type CampaignUpdateInput,
  type Dnd5eSrdCharacterOriginsInfo,
  type DndCustomContentDraft,
  type DndMonsterVariantDraft,
  type Dnd5eSrdRulesPreviewResult,
  type EncounterCreateInput,
  type EncounterUpdateInput,
  type PluginCampaignInfo,
  type PluginInstallResult,
  type SceneVisionOptions,
  type SystemActorAdvanceResult,
  type SystemActorRestResult,
  type SystemCharacterCreateInput,
  type SystemCharacterCreateResult,
  type SystemEncounterPlanInput,
  type TokenPatchInput,
} from "./index.js";

const campaignId = "camp_client";
const sceneId = "scn_client";
const assetId = "asset_client";
const tokenId = "tok_client";
const actorId = "act_client";
const itemId = "item_client";
const merchantId = "merchant_client";
const weaponItemId = "weapon_client";
const entryId = "jnl_client";
const messageId = "msg_client";
const macroId = "mac_client";
const rollId = "roll_client";
const audioTrackId = "aud_client";
const combatId = "cmb_client";
const combatantId = "cmbt_client";
const combatActionId = "cact_client";
const combatMechanicId = "mechanic_client";
const dndRulesMutationId = "drmut_client";
const proposalId = "prop_client";
const importId = "imp_client";
const pluginId = "plugin_client";
const pluginKey = "setting_client";
const systemId = "dnd-5e-srd";
const conditionId = "cond_client";
const monsterTemplateId = "monster_template_client";
const factId = "fact_client";
const toolCallId = "tool_client";
const inviteId = "inv_client";
const sessionId = "sess_client";
const requestId = "req_client";
const fogId = "fog_client";
const wallId = "wall_client";
const lightId = "light_client";
const annotationId = "anno_client";
const terrainRegionId = "terrain_client";
const coverOverrideId = "cover_client";
const organizationMemberId = "orgmem_client";
const campaignMemberId = "mem_client";
const campaignSessionId = "cses_client";
const characterTransferId = "ctr_client";
const worldId = "world_client";
const worldRecordId = "wrec_client";
const worldRelationId = "wrel_client";
const calculationOverrideId = "calc_override_client";
const handoutId = "hnd_client";
const encounterId = "enc_client";
const webhookId = "webhook_client";
const webhookDeliveryId = "delivery_client";
const delegatedUserId = "usr_delegated_client";
const archiveImportOperationId = "arcimp_client";

describe("OpenTabletopClient", () => {
  it("builds typed realtime websocket helpers", () => {
    const sockets: Array<{ url: string; protocols?: string | string[] }> = [];
    class MockWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        sockets.push({ url: url.toString(), protocols });
      }
    }

    const client = new OpenTabletopClient("https://api.test/base", {
      token: "ots_test",
    });
    expect(client.realtimeUrl(campaignId)).toBe(
      "wss://api.test/base/api/v1/realtime?campaignId=camp_client",
    );
    expect(client.realtimeUrl(campaignId, { token: "override_token" })).toBe(
      "wss://api.test/base/api/v1/realtime?campaignId=camp_client",
    );

    const localClient = new OpenTabletopClient("http://localhost:4000", {});
    expect(localClient.realtimeUrl(campaignId)).toBe(
      "ws://localhost:4000/api/v1/realtime?campaignId=camp_client",
    );

    const socket = client.connectRealtime(campaignId, {
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      protocols: ["otte.v1"],
    });
    expect(socket).toBeInstanceOf(MockWebSocket);
    expect(sockets).toEqual([
      {
        url: "wss://api.test/base/api/v1/realtime?campaignId=camp_client",
        protocols: ["otte.v1", "otte.auth.ots_test"],
      },
    ]);

    expect(
      client.parseRealtimeMessage({
        data: '{"id":"evt_client","campaignId":"camp_client","type":"chat.message.created","timestamp":"2026-05-15T00:00:00.000Z","payload":{"messageId":"msg_client"}}',
      } as MessageEvent<string>),
    ).toMatchObject({
      id: "evt_client",
      campaignId,
      type: "chat.message.created",
      payload: { messageId },
    });
  });

  it("requests bounded campaign snapshot history", async () => {
    let requestedUrl: URL | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input.toString());
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.campaignSnapshot(campaignId, sceneId, 25);

    expect(requestedUrl?.pathname).toBe(
      "/api/v1/campaigns/camp_client/snapshot",
    );
    expect(requestedUrl?.searchParams.get("sceneId")).toBe(sceneId);
    expect(requestedUrl?.searchParams.get("historyLimit")).toBe("25");
  });

  it("previews and executes exact operational retention with distinct retry identities", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: new URL(input.toString()), init });
        return new Response(JSON.stringify({ targetSetHash: "a".repeat(64), selected: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    await client.operationalRetentionDiagnostics();
    await client.previewOperationalRetention({ recordClasses: ["maintenance_jobs"], olderThanDays: 90 }, "retention-preview-client");
    await client.pruneOperationalRetention({ recordClasses: ["maintenance_jobs"], olderThanDays: 90, targetSetHash: "a".repeat(64), reason: "Measured cleanup after recovery proof." }, "retention-execute-client");

    expect(requests.map((request) => [request.init?.method, request.url.pathname, new Headers(request.init?.headers).get("idempotency-key")])).toEqual([
      ["GET", "/api/v1/admin/retention/operations", null],
      ["POST", "/api/v1/admin/retention/prune", "retention-preview-client"],
      ["POST", "/api/v1/admin/retention/prune", "retention-execute-client"],
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ dryRun: true, olderThanDays: 90 });
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({ dryRun: false, targetSetHash: "a".repeat(64) });
  });

  it("sends exact-revision Heroic Inspiration grant and selected-die reroll requests", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: new URL(input.toString()), init });
        return new Response(JSON.stringify({ actor: {}, awardedTo: "actor", originalRoll: {}, reroll: {}, chat: {}, mustUseNewRoll: true }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    await client.grantDnd5eSrdHeroicInspiration(campaignId, actorId, { expectedActorUpdatedAt: "2026-07-15T00:00:00.000Z" }, { idempotencyKey: "heroic-grant-client" });
    await client.rerollDnd5eSrdHeroicInspiration(campaignId, actorId, { originalRollId: rollId, selectedTermIndex: 0, selectedResultIndex: 1, expectedActorUpdatedAt: "2026-07-15T00:00:01.000Z" }, { idempotencyKey: "heroic-reroll-client" });

    expect(requests.map((request) => [request.url.pathname, new Headers(request.init?.headers).get("idempotency-key")])).toEqual([
      ["/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/heroic-inspiration/grant", "heroic-grant-client"],
      ["/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/heroic-inspiration/reroll", "heroic-reroll-client"],
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ originalRollId: rollId, selectedTermIndex: 0, selectedResultIndex: 1 });
  });

  it("prepares each Rage lifecycle action through the typed exact-revision contract", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: new URL(input.toString()), init });
        return new Response(JSON.stringify({ actor: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    await Promise.all((["start", "extend", "end"] as const).map((kind) => client.prepareDnd5eSrdRageAction(
      campaignId,
      actorId,
      { kind, expectedUpdatedAt: "2026-07-15T00:00:00.000Z" },
      { idempotencyKey: `rage-${kind}-client` },
    )));

    expect(requests.map((request) => ({
      path: request.url.pathname,
      key: new Headers(request.init?.headers).get("idempotency-key"),
      body: JSON.parse(String(request.init?.body)),
    }))).toEqual([
      expect.objectContaining({ key: "rage-start-client", body: expect.objectContaining({ rollId: "feature-rage", consumeResources: true, prepare: true, commit: false }) }),
      expect.objectContaining({ key: "rage-extend-client", body: expect.objectContaining({ rollId: "feature-rage-extend", consumeResources: true, prepare: true, commit: false }) }),
      expect.objectContaining({ key: "rage-end-client", body: expect.objectContaining({ rollId: "feature-rage-end", consumeResources: true, prepare: true, commit: false }) }),
    ]);
    expect(requests.every((request) => request.url.pathname === "/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/roll")).toBe(true);
  });

  it("posts one exact-revision encounter placement batch with its retry key", async () => {
    let request: { url: URL; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        request = { url: new URL(input.toString()), init };
        return new Response(JSON.stringify({ placements: [], scene: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const input = {
      systemId,
      expectedUpdatedAt: "2026-07-15T12:00:00.000Z",
      placements: [{
        threatId: "goblin-boss",
        name: "Goblin Boss",
        x: 100,
        y: 150,
        width: 50,
        height: 50,
        layer: "player" as const,
        disposition: "hostile" as const,
      }],
    };

    await client.placeEncounterMonsters(sceneId, input, "encounter-placement-client");

    expect(request?.url.pathname).toBe(
      "/api/v1/scenes/scn_client/encounter-monster-placements",
    );
    expect(new Headers(request?.init?.headers).get("idempotency-key")).toBe(
      "encounter-placement-client",
    );
    expect(JSON.parse(String(request?.init?.body))).toEqual(input);
  });

  it("sends auth headers and request bodies consistently", async () => {
    const requests: Array<{
      method: string;
      url: URL;
      headers: Record<string, string>;
      body?: BodyInit | null;
    }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      userId: "usr_legacy",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? "GET",
          url: new URL(input.toString()),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: init?.body,
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.campaigns();
    await client.createCampaign(
      {
        name: "JSON Campaign",
        permissionTemplate: "player_authoring",
        starterContent: false,
      },
      "campaign-create-json-test",
    );
    await client.updateCampaign(
      campaignId,
      {
        name: "Renamed Campaign",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      },
      "update-campaign-json-test",
    );
    await client.deleteCampaign(
      campaignId,
      "2026-07-13T00:00:00.000Z",
      "campaign-delete-json-test",
    );
    await client.uploadAsset(campaignId, "raw-svg-body", {
      contentType: "image/svg+xml",
      fileName: "map.svg",
      folder: "Maps",
      tags: ["alpha", "beta"],
      idempotencyKey: "asset-upload-json-test",
    });
    await client.analyzePdfContentImport(campaignId, "raw-pdf-body", {
      sourceName: "module.pdf",
      idempotencyKey: "content-pdf-json-test",
    });

    expect(
      requests.map((request) => `${request.method} ${request.url.pathname}`),
    ).toEqual([
      "GET /api/v1/campaigns",
      "POST /api/v1/campaigns",
      "PATCH /api/v1/campaigns/camp_client",
      "DELETE /api/v1/campaigns/camp_client",
      "POST /api/v1/campaigns/camp_client/assets/upload",
      "POST /api/v1/campaigns/camp_client/content-imports/pdf/ai",
    ]);
    for (const request of requests) {
      expect(request.headers.authorization).toBe("Bearer ots_test");
      expect(request.headers["x-user-id"]).toBe("usr_legacy");
    }
    expect(requests[0]!.headers["content-type"]).toBeUndefined();
    expect(requests[0]!.body).toBeUndefined();
    expect(requests[1]!.headers["content-type"]).toBe("application/json");
    expect(requests[1]!.body).toBe(
      JSON.stringify({
        name: "JSON Campaign",
        permissionTemplate: "player_authoring",
        starterContent: false,
      }),
    );
    expect(requests[2]!.headers["content-type"]).toBe("application/json");
    expect(requests[2]!.body).toBe(
      JSON.stringify({
        name: "Renamed Campaign",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      }),
    );
    expect(requests[3]!.headers["content-type"]).toBeUndefined();
    expect(requests[3]!.body).toBeUndefined();
    expect(requests[4]!.headers["content-type"]).toBe("image/svg+xml");
    expect(requests[4]!.headers["x-asset-name"]).toBe("map.svg");
    expect(requests[4]!.headers["x-asset-folder"]).toBe("Maps");
    expect(requests[4]!.headers["x-asset-tags"]).toBe("alpha,beta");
    expect(requests[4]!.body).toBe("raw-svg-body");
    expect(requests[4]!.url.search).toBe("");
    expect(requests[5]!.headers["content-type"]).toBe("application/pdf");
    expect(requests[5]!.headers["x-source-name"]).toBe("module.pdf");
    expect(requests[5]!.body).toBe("raw-pdf-body");
  });

  it("normalizes trailing slashes while preserving reverse-proxy path prefixes", async () => {
    const requests: string[] = [];
    const client = new OpenTabletopClient("https://api.test/tabletop/", {
      fetch: (async (input: RequestInfo | URL) => {
        requests.push(input.toString());
        return new Response(
          JSON.stringify({ ok: true, version: "test", service: "api" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await client.health();

    expect(requests).toEqual(["https://api.test/tabletop/api/v1/health"]);
    expect(client.realtimeUrl(campaignId)).toBe(
      "wss://api.test/tabletop/api/v1/realtime?campaignId=camp_client",
    );
  });

  it("requests a permission-filtered player vision preview with typed options", async () => {
    let requestedUrl: URL | undefined;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input.toString());
        return new Response(
          JSON.stringify({
            sceneId,
            userId: "usr/player",
            fogActive: true,
            polygons: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });
    const options = {
      previewUserId: "usr/player",
    } satisfies SceneVisionOptions;

    const vision = await client.sceneVision(sceneId, options);

    expect(requestedUrl?.pathname).toBe(`/api/v1/scenes/${sceneId}/vision`);
    expect(requestedUrl?.searchParams.get("previewUserId")).toBe("usr/player");
    expect(vision).toMatchObject({
      sceneId,
      userId: "usr/player",
      fogActive: true,
    });
  });

  it("throws server error response bodies", async () => {
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async () =>
        new Response(
          JSON.stringify({
            error: "bad_request",
            message: "Invalid client payload",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    await expect(
      client.createCampaign({ name: "" }, "campaign-create-error-test"),
    ).rejects.toThrow(
      '{"error":"bad_request","message":"Invalid client payload"}',
    );
  });

  it("uses the server plugin envelopes and campaign-member response types", async () => {
    const requests: Array<{
      method: string;
      url: string;
      body?: BodyInit | null;
      headers: Headers;
    }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? "GET",
          url: input.toString(),
          body: init?.body,
          headers: new Headers(init?.headers),
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const members = client.campaignMembers(campaignId);
    const updatedMember = client.updateCampaignMember(
      campaignId,
      campaignMemberId,
      { role: "player", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
      "campaign-member-update-test",
    );
    const removedMember = client.removeCampaignMember(
      campaignId,
      campaignMemberId,
      "2026-07-13T00:00:00.000Z",
      "campaign-member-delete-test",
    );
    const campaignPlugins = client.plugins(campaignId);
    const installed = client.installPlugin(
      campaignId,
      pluginId,
      {
        permissions: ["chat.write"],
        version: "1.0.0",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      },
      "plugin-install-test",
    );
    expectTypeOf(members).toEqualTypeOf<Promise<CampaignSnapshotMember[]>>();
    expectTypeOf(updatedMember).toEqualTypeOf<
      Promise<CampaignSnapshotMember>
    >();
    expectTypeOf(removedMember).toEqualTypeOf<
      Promise<CampaignSnapshotMember>
    >();
    expectTypeOf(campaignPlugins).toEqualTypeOf<
      Promise<PluginCampaignInfo[]>
    >();
    expectTypeOf(installed).toEqualTypeOf<Promise<PluginInstallResult>>();
    await Promise.all([
      members,
      updatedMember,
      removedMember,
      campaignPlugins,
      installed,
      client.registerPlugin(
        {
          campaignId,
          packagePath: "versioned-browser-plugin-1",
        },
        "plugin-register-test",
      ),
      client.syncPluginRegistry(
        {
          campaignId,
          registryUrl: "https://plugins.example.test/index.json",
          expectedRegistryRevision:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        "plugin-registry-sync-test",
      ),
      client.setPluginStorageEntry(
        campaignId,
        pluginId,
        pluginKey,
        {
          enabled: true,
        },
        { expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "plugin-storage-create-test",
      ),
    ]);

    const bodyFor = (suffix: string) =>
      requests.find((request) => request.url.endsWith(suffix))?.body;
    expect(
      bodyFor(`/campaigns/${campaignId}/plugins/${pluginId}/install`),
    ).toBe(
      JSON.stringify({
        permissions: ["chat.write"],
        version: "1.0.0",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      }),
    );
    expect(bodyFor("/plugins/install")).toBe(
      JSON.stringify({ campaignId, packagePath: "versioned-browser-plugin-1" }),
    );
    expect(bodyFor("/plugins/registry/sync")).toBe(
      JSON.stringify({
        campaignId,
        registryUrl: "https://plugins.example.test/index.json",
        expectedRegistryRevision:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    );
    expect(bodyFor(`/storage/${pluginKey}`)).toBe(
      JSON.stringify({
        value: { enabled: true },
        expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
      }),
    );
    expect(
      requests
        .find((request) => request.url.endsWith("/plugins/install"))
        ?.headers.get("idempotency-key"),
    ).toBe("plugin-register-test");
    expect(
      requests
        .find((request) => request.url.endsWith("/plugins/registry/sync"))
        ?.headers.get("idempotency-key"),
    ).toBe("plugin-registry-sync-test");
  });

  it("sends mandatory idempotency identity for external system registration", async () => {
    let requestHeaders: Headers | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ id: "operator-system" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.registerSystem(
      campaignId,
      {
        id: "operator-system",
        name: "Operator System",
        version: "1.0.0",
        compatibleCore: ">=0.3.0",
        entrypoints: {},
        schemas: {
          actor: "schemas/actor.json",
          item: "schemas/item.json",
        },
        permissions: [],
        capabilities: ["data-model"],
      },
      "system-register-idempotency",
    );

    expect(requestHeaders?.get("idempotency-key")).toBe(
      "system-register-idempotency",
    );
  });

  it("exposes complete campaign creation, snapshot, and search types", () => {
    expectTypeOf<CampaignCreateInput>().toMatchTypeOf<{
      permissionTemplate?:
        "standard" | "player_authoring" | "ai_assisted" | "assistant_ops";
      starterContent?: boolean;
    }>();
    expectTypeOf<
      CampaignSnapshot["bundled"]
    >().toEqualTypeOf<CampaignSnapshotBundled>();
    expectTypeOf<CampaignSnapshot["presences"]>().toEqualTypeOf<
      CampaignPresence[]
    >();
    expectTypeOf<keyof CampaignUpdateInput>().toEqualTypeOf<
      | "name"
      | "description"
      | "defaultSystemId"
      | "visibility"
      | "rulesProfile"
      | "expectedUpdatedAt"
    >();
    expectTypeOf<CampaignSearchResult["type"]>().toEqualTypeOf<
      | "world"
      | "scene"
      | "actor"
      | "item"
      | "journal"
      | "handout"
      | "encounter"
      | "memory"
      | "chat"
      | "roll"
    >();
  });

  it("exposes saved encounter composition inputs without immutable fields", () => {
    expectTypeOf<keyof EncounterCreateInput>().toEqualTypeOf<
      | "name"
      | "summary"
      | "tokenIds"
      | "difficulty"
      | "systemId"
      | "partyActorIds"
      | "threats"
      | "worldId"
    >();
    expectTypeOf<EncounterUpdateInput>().toEqualTypeOf<EncounterCreateInput>();
    expectTypeOf<SystemEncounterPlanInput["threats"]>().toEqualTypeOf<
      Array<{ id: string; count: number }> | undefined
    >();
  });

  it("types system creator, rules transaction, and token patch envelopes", () => {
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    });

    expectTypeOf(
      client.systemCharacterOrigins(campaignId, systemId),
    ).toEqualTypeOf<Promise<Dnd5eSrdCharacterOriginsInfo>>();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["draconicAncestors"][number]["damageType"]
    >().toEqualTypeOf<"acid" | "cold" | "fire" | "lightning" | "poison">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["giantAncestries"][number]["activation"]
    >().toEqualTypeOf<"bonus-action" | "on-hit" | "reaction">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["classStartingEquipment"][number]["packages"][number]["gp"]
    >().toEqualTypeOf<number>();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["weaponMasteryOptions"][number]["weaponCategory"]
    >().toEqualTypeOf<"simple" | "martial">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["classSpellChoices"][number]["slotPool"]
    >().toEqualTypeOf<"none" | "spellcasting" | "pact-magic">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["classSpellChoices"][number]["slotRecovery"]
    >().toEqualTypeOf<"none" | "long" | "short">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["eldritchInvocations"][number]["automation"]
    >().toEqualTypeOf<"item" | "manual">();
    expectTypeOf<
      Dnd5eSrdCharacterOriginsInfo["originFeatOptions"][number]["magicInitiateClass"]
    >().toEqualTypeOf<"cleric" | "druid" | "wizard" | undefined>();
    expectTypeOf<SystemCharacterCreateInput>().toMatchTypeOf<{
      draconicAncestry?: string;
      giantAncestry?: string;
      classEquipmentPackageId?: string;
      backgroundEquipmentPackageId?: string;
      classEquipmentChoices?: Record<string, string>;
      backgroundEquipmentChoices?: Record<string, string>;
      classToolProficiencyChoices?: string[];
      backgroundToolProficiencyChoice?: string;
      weaponMasteryChoices?: string[];
      classCantripChoices?: string[];
      classPreparedSpellChoices?: string[];
      wizardSpellbookChoices?: string[];
      backgroundMagicInitiateCantrips?: string[];
      backgroundMagicInitiateSpell?: string;
      backgroundMagicInitiateAbility?: string;
      originFeatMagicInitiateCantrips?: string[];
      originFeatMagicInitiateSpell?: string;
      originFeatMagicInitiateAbility?: string;
      skilledProficiencyChoices?: string[];
      fightingStyle?: string;
      divineOrder?: string;
      primalOrder?: string;
      rogueExpertiseChoices?: string[];
      eldritchInvocation?: string;
      pactTomeCantripChoices?: string[];
      pactTomeRitualChoices?: string[];
    }>();
    expectTypeOf(
      client.createSystemCharacter(
        campaignId,
        systemId,
        {
          creationMode: "level-one-srd",
          templateId: "fighter",
        },
        "character-create-type-test",
      ),
    ).toEqualTypeOf<Promise<SystemCharacterCreateResult>>();
    expectTypeOf(
      client.systemActorRulesPreview(campaignId, systemId, actorId, {
        operation: "typed-damage",
        amount: 4,
        damageType: "fire",
      }),
    ).toEqualTypeOf<Promise<Dnd5eSrdRulesPreviewResult>>();
    expectTypeOf(
      client.commitDnd5eSrdAdvancement(
        campaignId,
        actorId,
        {
          optionId: "level-up",
          hitPointMode: "fixed",
          preparedPreviewKey: "advancement-preview-1",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "advancement-commit-1" },
      ),
    ).toEqualTypeOf<Promise<SystemActorAdvanceResult>>();
    expectTypeOf(
      client.commitDnd5eSrdRest(
        campaignId,
        actorId,
        {
          restType: "short",
          preparedPreviewKey: "rest-preview-1",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "rest-commit-1" },
      ),
    ).toEqualTypeOf<Promise<SystemActorRestResult>>();
    expectTypeOf<TokenPatchInput>().toMatchTypeOf<{
      brightVisionRadius?: number | null;
      dimVisionRadius?: number | null;
    }>();
  });

  it("supports archive and chat export runtime permutations", async () => {
    const requests: Array<{
      method: string;
      url: URL;
      headers: Record<string, string>;
      body?: BodyInit | null;
    }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        requests.push({
          method: init?.method ?? "GET",
          url,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: init?.body,
        });
        if (url.searchParams.get("format") === "ndjson") {
          return new Response('{"body":"hello"}\n', {
            status: 200,
            headers: { "content-type": "application/x-ndjson" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.exportChat(campaignId, { format: "json" });
    await expect(client.exportChatNdjson(campaignId)).resolves.toBe(
      '{"body":"hello"}\n',
    );
    await client.exportCampaign(campaignId, {
      scope: "selected_collections",
      collections: ["actors", "journals"],
      version: "0.2.0",
      redaction: "portable",
    });
    await client.exportCampaignStream(campaignId, {
      scope: "world",
      scopeId: "world_client",
    });
    await client.importCampaign(
      { format: "ottx" },
      "campaign-import-dry-run-test",
      {
        mode: "dry_run",
        scope: "selected_collections",
        collections: ["journals", "assets"],
      },
    );
    await client.importCampaign(
      { format: "ottx" },
      "campaign-import-regenerate-test",
      { regenerateIds: true },
    );
    await client.importCampaignStream(
      new Blob(["framed archive"]),
      "campaign-import-stream-test",
      {
        mode: "dry_run",
        scope: "assets_only",
        regenerateIds: true,
        expectedUpdatedAt: "2026-07-13T12:34:56.000Z",
      },
    );

    expect(
      requests.map((request) => `${request.method} ${request.url.pathname}`),
    ).toEqual([
      "GET /api/v1/campaigns/camp_client/chat/export",
      "GET /api/v1/campaigns/camp_client/chat/export",
      "GET /api/v1/campaigns/camp_client/export",
      "GET /api/v1/campaigns/camp_client/export/stream",
      "POST /api/v1/import/campaign",
      "POST /api/v1/import/campaign",
      "POST /api/v1/import/campaign/stream",
    ]);
    expect(
      requests.every(
        (request) => request.headers.authorization === "Bearer ots_test",
      ),
    ).toBe(true);
    expect(requests[0]!.url.searchParams.get("format")).toBe("json");
    expect(requests[1]!.url.searchParams.get("format")).toBe("ndjson");
    expect(requests[2]!.url.searchParams.get("scope")).toBe(
      "selected_collections",
    );
    expect(requests[2]!.url.searchParams.get("collections")).toBe(
      "actors,journals",
    );
    expect(requests[2]!.url.searchParams.get("version")).toBe("0.2.0");
    expect(requests[2]!.url.searchParams.get("redaction")).toBe("portable");
    expect(requests[3]!.url.searchParams.get("scope")).toBe("world");
    expect(requests[3]!.url.searchParams.get("scopeId")).toBe("world_client");
    expect(requests[4]!.headers["content-type"]).toBe("application/json");
    expect(requests[4]!.body).toBe(
      JSON.stringify({
        archive: { format: "ottx" },
        mode: "dry_run",
        scope: "selected_collections",
        collections: ["journals", "assets"],
      }),
    );
    expect(requests[5]!.body).toBe(
      JSON.stringify({
        archive: { format: "ottx" },
        regenerateIds: true,
      }),
    );
    expect(requests[6]!.headers["content-type"]).toBe(
      "application/vnd.open-tabletop.ottx-stream",
    );
    expect(requests[6]!.headers["idempotency-key"]).toBe(
      "campaign-import-stream-test",
    );
    expect(requests[6]!.url.searchParams.get("mode")).toBe("dry_run");
    expect(requests[6]!.url.searchParams.get("scope")).toBe("assets_only");
    expect(requests[6]!.url.searchParams.get("regenerateIds")).toBe("true");
    expect(requests[6]!.url.searchParams.get("expectedUpdatedAt")).toBe(
      "2026-07-13T12:34:56.000Z",
    );
  });

  it("sends ownership transfer revision and idempotency separately", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: input.toString(), init };
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.transferCampaignOwnership(
      campaignId,
      {
        targetUserId: "usr_next_owner",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        reason: "Next season",
      },
      "campaign-owner-transfer-1",
    );

    expect(captured?.url).toBe(
      "http://api.test/api/v1/campaigns/camp_client/ownership-transfer",
    );
    expect(captured?.init?.method).toBe("POST");
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe(
      "campaign-owner-transfer-1",
    );
    expect(captured?.init?.body).toBe(
      JSON.stringify({
        targetUserId: "usr_next_owner",
        expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        reason: "Next season",
      }),
    );
  });

  it("requires combat reward callers to provide an idempotency key header", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: input.toString(), init };
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.awardCombatRewards(
      combatId,
      { recipientActorIds: [actorId], totalXp: 100 },
      "combat-reward-client-1",
    );

    expect(captured?.url).toBe(
      "http://api.test/api/v1/combats/cmb_client/rewards",
    );
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe(
      "combat-reward-client-1",
    );
  });

  it("sends advanced combat mechanics revisions, outcomes, and replay keys", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      userId: "usr_gm",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const revision = "2026-07-13T00:00:00.000Z";
    const mechanicId = "mechanic/one";

    await client.createCombatEnvironmentMechanic(
      combatId,
      {
        kind: "lair_action",
        name: "Vault pulse",
        description: "The vault hums.",
        schedule: {
          timing: "initiative_count",
          initiativeCount: 20,
          startsAtRound: 1,
          intervalRounds: 1,
        },
        expectedUpdatedAt: revision,
      },
      "mechanic-create-1",
    );
    await client.updateCombatEnvironmentMechanic(
      combatId,
      mechanicId,
      {
        enabled: false,
        expectedUpdatedAt: revision,
      },
      "mechanic-update-1",
    );
    await client.deleteCombatEnvironmentMechanic(
      combatId,
      mechanicId,
      revision,
      "mechanic-delete-1",
    );
    await client.triggerCombatEnvironmentMechanic(
      combatId,
      mechanicId,
      {
        expectedUpdatedAt: revision,
        summary: "Pulse resolved manually.",
      },
      "mechanic-trigger-1",
    );
    await client.previewCombatEffectSchedule(
      combatId,
      { phase: "end_turn", now: revision, prepare: true },
      { idempotencyKey: "effects-preview-1" },
    );
    await client.advanceCombatEffectSchedule(
      combatId,
      {
        preparedPreviewKey: "effects-preview-1",
        expectedUpdatedAt: revision,
      },
      { idempotencyKey: "effects-advance-1" },
    );
    await client.previewDnd5eSpellHelper(campaignId, systemId, {
      casterActorId: actorId,
      spellId: "magic-missile",
      targetActorIds: ["act_target"],
      slotLevel: 1,
      options: { dartAssignments: { act_target: 3 } },
    });

    expect(
      captured.map((request) => [request.init?.method, request.url]),
    ).toEqual([
      [
        "POST",
        "http://api.test/api/v1/combats/cmb_client/environment-mechanics",
      ],
      [
        "PATCH",
        "http://api.test/api/v1/combats/cmb_client/environment-mechanics/mechanic%2Fone",
      ],
      [
        "DELETE",
        "http://api.test/api/v1/combats/cmb_client/environment-mechanics/mechanic%2Fone",
      ],
      [
        "POST",
        "http://api.test/api/v1/combats/cmb_client/environment-mechanics/mechanic%2Fone/trigger",
      ],
      ["POST", "http://api.test/api/v1/combats/cmb_client/effects/preview"],
      ["POST", "http://api.test/api/v1/combats/cmb_client/effects/advance"],
      [
        "POST",
        "http://api.test/api/v1/campaigns/camp_client/systems/dnd-5e-srd/spell-helper/preview",
      ],
    ]);
    expect(
      captured
        .slice(0, 4)
        .map((request) =>
          new Headers(request.init?.headers).get("Idempotency-Key"),
        ),
    ).toEqual([
      "mechanic-create-1",
      "mechanic-update-1",
      "mechanic-delete-1",
      "mechanic-trigger-1",
    ]);
    expect(new Headers(captured[5]?.init?.headers).get("Idempotency-Key")).toBe(
      "effects-advance-1",
    );
    expect(captured[2]?.init?.body).toBe(
      JSON.stringify({ expectedUpdatedAt: revision }),
    );
    expect(new Headers(captured[4]?.init?.headers).get("Idempotency-Key")).toBe(
      "effects-preview-1",
    );
    expect(captured[4]?.init?.body).toBe(
      JSON.stringify({ phase: "end_turn", now: revision, prepare: true }),
    );
    expect(captured[5]?.init?.body).toBe(
      JSON.stringify({
        preparedPreviewKey: "effects-preview-1",
        expectedUpdatedAt: revision,
      }),
    );
  });

  it("sends condition revisions and replay keys without mixing them into route identity", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({ actor: { id: actorId } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const revision = "2026-07-13T00:00:00.000Z";

    await client.addSystemActorCondition(
      campaignId,
      systemId,
      actorId,
      { conditionId: "exhaustion", level: 2, expectedUpdatedAt: revision },
      "condition-apply-client-1",
    );
    await client.removeSystemActorCondition(
      campaignId,
      systemId,
      actorId,
      "exhaustion",
      { expectedUpdatedAt: revision },
      "condition-remove-client-1",
    );

    expect(captured[0]?.url).toBe(
      "http://api.test/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/conditions",
    );
    expect(new Headers(captured[0]?.init?.headers).get("Idempotency-Key")).toBe(
      "condition-apply-client-1",
    );
    expect(captured[0]?.init?.body).toBe(
      JSON.stringify({
        conditionId: "exhaustion",
        level: 2,
        expectedUpdatedAt: revision,
      }),
    );
    expect(captured[1]?.url).toBe(
      `http://api.test/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/conditions/exhaustion?expectedUpdatedAt=${encodeURIComponent(revision)}`,
    );
    expect(new Headers(captured[1]?.init?.headers).get("Idempotency-Key")).toBe(
      "condition-remove-client-1",
    );
    expect(captured[1]?.init?.body).toBeUndefined();
  });

  it("sends compendium filters, actor revisions, conflict choices, and replay keys", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const revision = "2026-07-13T00:00:00.000Z";

    await client.systemCompendium(campaignId, systemId, {
      q: "healing word",
      types: ["spell", "item"],
    });
    await client.addSystemCompendiumToActor(
      campaignId,
      systemId,
      actorId,
      {
        entryId: "healing-word",
        expectedUpdatedAt: revision,
        conflictChoice: "replace_existing",
      },
      "compendium-add-client-1",
    );
    await client.purchaseSystemEquipment(
      campaignId,
      systemId,
      actorId,
      {
        entryId: "bedroll",
        quantity: 2,
        expectedUpdatedAt: revision,
        conflictChoice: "merge_existing",
      },
      "compendium-purchase-client-1",
    );

    expect(captured[0]?.url).toBe(
      "http://api.test/api/v1/campaigns/camp_client/systems/dnd-5e-srd/compendium?q=healing+word&types=spell%2Citem",
    );
    expect(new Headers(captured[1]?.init?.headers).get("Idempotency-Key")).toBe(
      "compendium-add-client-1",
    );
    expect(captured[1]?.init?.body).toBe(
      JSON.stringify({
        entryId: "healing-word",
        expectedUpdatedAt: revision,
        conflictChoice: "replace_existing",
      }),
    );
    expect(new Headers(captured[2]?.init?.headers).get("Idempotency-Key")).toBe(
      "compendium-purchase-client-1",
    );
    expect(captured[2]?.init?.body).toBe(
      JSON.stringify({
        entryId: "bedroll",
        quantity: 2,
        expectedUpdatedAt: revision,
        conflictChoice: "merge_existing",
      }),
    );
  });

  it("sends scene tactical revisions and stable replay keys", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const revision = "2026-07-13T00:00:00.000Z";

    await client.createDifficultTerrain(
      sceneId,
      {
        label: "Rubble",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        expectedUpdatedAt: revision,
      },
      "terrain-create-client-1",
    );
    await client.updateDifficultTerrain(
      sceneId,
      terrainRegionId,
      {
        label: "Deep rubble",
        expectedUpdatedAt: revision,
      },
      "terrain-update-client-1",
    );
    await client.deleteDifficultTerrain(
      sceneId,
      terrainRegionId,
      revision,
      "terrain-delete-client-1",
    );
    await client.setSceneCoverOverride(
      sceneId,
      {
        sourceTokenId: "tok_source",
        targetTokenId: "tok_target",
        level: "three_quarters",
        expectedUpdatedAt: revision,
      },
      "cover-set-client-1",
    );
    await client.deleteSceneCoverOverride(
      sceneId,
      coverOverrideId,
      revision,
      "cover-delete-client-1",
    );

    expect(
      captured.map((request) =>
        new Headers(request.init?.headers).get("Idempotency-Key"),
      ),
    ).toEqual([
      "terrain-create-client-1",
      "terrain-update-client-1",
      "terrain-delete-client-1",
      "cover-set-client-1",
      "cover-delete-client-1",
    ]);
    expect(captured[0]?.init?.body).toContain(
      `"expectedUpdatedAt":"${revision}"`,
    );
    expect(captured[1]?.init?.body).toContain(
      `"expectedUpdatedAt":"${revision}"`,
    );
    expect(captured[2]?.url).toBe(
      `http://api.test/api/v1/scenes/${sceneId}/difficult-terrain/${terrainRegionId}?expectedUpdatedAt=${encodeURIComponent(revision)}`,
    );
    expect(captured[2]?.init?.body).toBeUndefined();
    expect(captured[3]?.init?.body).toContain(
      `"expectedUpdatedAt":"${revision}"`,
    );
    expect(captured[4]?.url).toBe(
      `http://api.test/api/v1/scenes/${sceneId}/cover-overrides/${coverOverrideId}?expectedUpdatedAt=${encodeURIComponent(revision)}`,
    );
    expect(captured[4]?.init?.body).toBeUndefined();
  });

  it("sends prepared rules previews with an idempotency key", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: input.toString(), init };
        return new Response(JSON.stringify({ status: "ready" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.systemActorRulesPreview(
      campaignId,
      systemId,
      actorId,
      { operation: "rest", restType: "short", prepare: true, hitDice: [{}] },
      "rest-preview-client-1",
    );

    expect(captured?.url).toBe(
      "http://api.test/api/v1/campaigns/camp_client/systems/dnd-5e-srd/actors/act_client/rules-preview",
    );
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe(
      "rest-preview-client-1",
    );
    expect(captured?.init?.body).toBe(
      JSON.stringify({
        operation: "rest",
        restType: "short",
        prepare: true,
        hitDice: [{}],
      }),
    );
  });

  it("rejects prepared rules previews without a replay key before transport", async () => {
    let requestCount = 0;
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async () => {
        requestCount += 1;
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await expect(
      (
        client.systemActorRulesPreview as unknown as (
          campaignId: string,
          systemId: string,
          actorId: string,
          input: { operation: "rest"; restType: "short"; prepare: true },
        ) => Promise<unknown>
      )(campaignId, systemId, actorId, {
        operation: "rest",
        restType: "short",
        prepare: true,
      }),
    ).rejects.toThrow("Prepared D&D rules previews require an Idempotency-Key");
    expect(requestCount).toBe(0);
  });

  it("treats typed Weapon Mastery use as a consequential reviewed action", async () => {
    let captured: { body?: string; headers: Headers } | undefined;
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured = { ...(typeof init?.body === "string" ? { body: init.body } : {}), headers: new Headers(init?.headers) };
        return new Response(JSON.stringify({ status: "ready" }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    await client.rollSystemActor(campaignId, systemId, actorId, {
      rollId: "item-longsword-attack",
      targetActorId: "target",
      prepare: true,
      weaponMastery: { use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true },
    }, { idempotencyKey: "mastery-preview-client-1" });
    expect(captured?.headers.get("Idempotency-Key")).toBe("mastery-preview-client-1");
    expect(JSON.parse(captured?.body ?? "{}")).toMatchObject({ weaponMastery: { use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true } });
  });

  it("forwards replay keys for attunement, advancement, and rest mutations", async () => {
    const requests: Array<{ url: string; headers: Headers; body?: string }> =
      [];
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: input.toString(),
          headers: new Headers(init?.headers),
          ...(typeof init?.body === "string" ? { body: init.body } : {}),
        });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.changeSystemActorAttunement(
      campaignId,
      systemId,
      actorId,
      {
        itemId,
        attuned: false,
        expectedUpdatedAt: "rev-1",
        breakCurse: true,
        overrideReason: "Remove Curse",
      },
      { idempotencyKey: "attunement-client-1" },
    );
    await client.advanceSystemActor(
      campaignId,
      systemId,
      actorId,
      {
        optionId: "level-up",
        hitPointMode: "fixed",
        preparedPreviewKey: "advancement-preview-client-1",
        expectedUpdatedAt: "rev-1",
      },
      { idempotencyKey: "advancement-client-1" },
    );
    await client.restSystemActor(
      campaignId,
      systemId,
      actorId,
      {
        restType: "long",
        preparedPreviewKey: "rest-preview-client-1",
        expectedUpdatedAt: "rev-1",
      },
      { idempotencyKey: "rest-client-1" },
    );

    expect(
      requests.map((request) => request.headers.get("Idempotency-Key")),
    ).toEqual(["attunement-client-1", "advancement-client-1", "rest-client-1"]);
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({
      itemId,
      attuned: false,
      breakCurse: true,
      overrideReason: "Remove Curse",
    });
  });

  it("covers every public OpenAPI REST route or intentionally excludes it", async () => {
    const calls: string[] = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const customContentDraft = {
      kind: "condition",
      name: "Client condition",
      summary: "Client coverage draft",
      sourceName: "Home campaign",
      sourceVersion: "1",
      contentVersion: "1.0.0",
      license: { name: "Private home game", usage: "private_home_game" },
      data: { description: "Coverage" },
    } satisfies DndCustomContentDraft;
    const monsterTemplateDraft = {
      name: "Client elite defender",
      description: "OpenAPI coverage template.",
      overrides: { armorClass: 18, challengeRating: "1", xp: 200 },
    };
    const monsterVariantDraft = {
      name: "Client veteran guard",
      summary: "OpenAPI coverage variant.",
      sourceName: "Client campaign",
      sourceVersion: "1",
      contentVersion: "1.0.0",
      license: { name: "Private home game", usage: "private_home_game" },
      base: { kind: "bundled", id: "guard", version: "5.2.1" },
      overrides: { hitPoints: 44, challengeRating: "2", xp: 450 },
    } satisfies DndMonsterVariantDraft;
    const controlledRevisions = {
      actors: {},
      items: {},
      tokens: {},
      combats: {},
      scenes: {},
      encounters: {},
    };
    const controlledRequest = {
      kind: "summon" as const,
      sceneId,
      source: {
        kind: "spell" as const,
        actorId,
        itemId,
        name: "Client summon",
        systemId: "dnd-5e-srd" as const,
        rulesVersion: "SRD 5.2.1",
      },
      controllerUserId: "usr_client",
      controllerActorId: actorId,
      ownerUserId: "usr_client",
      actor: {
        name: "Client spirit",
        type: "summon",
        data: { hp: { current: 1, max: 1 }, rulesVersion: "SRD 5.2.1" },
      },
      token: {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        disposition: "friendly" as const,
      },
      duration: { mode: "until_dismissed" as const },
      initiative: { mode: "independent" as const },
      command: { required: true, action: "bonus_action" as const },
    };

    await Promise.all([
      client.health(),
      client.bootstrapStatus(),
      client.bootstrapOwner({
        email: "owner@example.test",
        displayName: "Owner",
        password: "password123",
        campaignName: "Campaign",
      }),
      client.login({ email: "owner@example.test", password: "password123" }),
      client.register({
        email: "new@example.test",
        displayName: "New",
        password: "password123",
      }),
      client.logout(),
      client.session(),
      client.profile(),
      client.updateProfile(
        {
          displayName: "Client Owner",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "profile-update-client",
      ),
      client.requestPasswordReset({ email: "owner@example.test" }),
      client.confirmPasswordReset({
        token: "opr_test",
        password: "password123",
      }),
      client.changePassword({
        currentPassword: "password123",
        newPassword: "password456",
      }),
      client.mfaStatus(),
      client.enrollTotpMfa({ currentPassword: "password123" }),
      client.confirmTotpMfa({ code: "123456" }),
      client.disableTotpMfa({ currentPassword: "password123" }),
      client.sessions(),
      client.deleteSession(sessionId),
      client.oidcConfig(),
      client.startOidc(),
      client.startOidcRedirect("/campaigns"),
      client.organizations(),
      client.createOrganization(
        { name: "Client Workspace" },
        "organization-create-client",
      ),
      client.switchOrganization("org_client"),
      client.workspaceDefaults(),
      client.updateWorkspaceDefaults(
        {
          defaultCampaignVisibility: "invite_only",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "organization-update-client",
      ),
      client.organizationMembers(),
      client.addOrganizationMember(
        {
          email: "member@example.test",
          role: "member",
          expectedOrganizationUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "organization-member-create-client",
      ),
      client.updateOrganizationMember(
        organizationMemberId,
        { role: "admin", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "organization-member-update-client",
      ),
      client.removeOrganizationMember(
        organizationMemberId,
        "2026-07-13T00:00:00.000Z",
        "organization-member-delete-client",
      ),
      client.organizationInvites(),
      client.createOrganizationInvite(
        {
          campaignId,
          email: "player@example.test",
          role: "player",
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "organization-invite-create-client",
      ),
      client.campaigns(),
      client.createCampaign({ name: "Campaign" }, "campaign-create-client"),
      client.campaign(campaignId),
      client.campaignSnapshot(campaignId),
      client.campaignPresence(campaignId),
      client.updateCampaign(
        campaignId,
        { name: "Renamed", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "update-campaign-client-test",
      ),
      client.archiveCampaign(
        campaignId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "campaign-archive-client",
      ),
      client.restoreCampaign(
        campaignId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "campaign-restore-client",
      ),
      client.transferCampaignOwnership(
        campaignId,
        {
          targetUserId: "usr_client_player",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "campaign-transfer-client-test",
      ),
      client.duplicateCampaign(
        campaignId,
        {
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          name: "Campaign copy",
        },
        "campaign-duplicate-client",
      ),
      client.characterTransfers(campaignId),
      client.createCharacterTransfer(
        campaignId,
        actorId,
        {
          toUserId: "usr_client_player",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "character-transfer-create-client",
      ),
      client.acceptCharacterTransfer(
        campaignId,
        characterTransferId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "character-transfer-accept-client",
      ),
      client.declineCharacterTransfer(
        campaignId,
        characterTransferId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "character-transfer-decline-client",
      ),
      client.cancelCharacterTransfer(
        campaignId,
        characterTransferId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "character-transfer-cancel-client",
      ),
      client.deleteCampaign(
        campaignId,
        "2026-07-13T00:00:00.000Z",
        "campaign-delete-client",
      ),
      client.campaignMembers(campaignId),
      client.updateCampaignMember(
        campaignId,
        campaignMemberId,
        { role: "player", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "campaign-member-update-client",
      ),
      client.removeCampaignMember(
        campaignId,
        campaignMemberId,
        "2026-07-13T00:00:00.000Z",
        "campaign-member-delete-client",
      ),
      client.campaignWebhooks(campaignId),
      client.createCampaignWebhook(
        campaignId,
        {
          name: "Coverage webhook",
          url: "https://hooks.example.test/open-tabletop",
          eventTypes: ["campaign.updated"],
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "webhook-create-client",
      ),
      client.updateCampaignWebhook(
        campaignId,
        webhookId,
        {
          enabled: true,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "webhook-update-client",
      ),
      client.disableCampaignWebhook(
        campaignId,
        webhookId,
        "2026-07-13T00:00:00.000Z",
        "webhook-disable-client",
      ),
      client.deleteCampaignWebhook(
        campaignId,
        webhookId,
        "2026-07-13T00:00:00.000Z",
        "webhook-delete-client",
      ),
      client.rotateCampaignWebhookSecret(
        campaignId,
        webhookId,
        "2026-07-13T00:00:00.000Z",
        "webhook-rotate-client",
      ),
      client.campaignWebhookDeliveries(campaignId, webhookId),
      client.testCampaignWebhook(
        campaignId,
        webhookId,
        "2026-07-13T00:00:00.000Z",
        "webhook-test-client",
      ),
      client.retryCampaignWebhookDelivery(
        campaignId,
        webhookId,
        webhookDeliveryId,
        "2026-07-13T00:00:00.000Z",
        "webhook-retry-client",
      ),
      client.campaignSessions(campaignId),
      client.createCampaignSession(
        campaignId,
        { title: "Session" },
        "session-create-client",
      ),
      client.campaignSession(campaignSessionId),
      client.updateCampaignSession(
        campaignSessionId,
        { title: "Session 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "session-update-client",
      ),
      client.startCampaignSession(
        campaignSessionId,
        "2026-07-13T00:00:00.000Z",
        "session-start-client",
        sceneId,
      ),
      client.completeCampaignSession(
        campaignSessionId,
        "2026-07-13T00:00:00.000Z",
        "session-complete-client",
        "Complete",
      ),
      client.deleteCampaignSession(
        campaignSessionId,
        "2026-07-13T00:00:00.000Z",
        "session-delete-client",
      ),
      client.searchCampaign(campaignId, {
        q: "vault",
        types: ["world", "scene"],
      }),
      client.campaignInvites(campaignId),
      client.createCampaignInvite(
        campaignId,
        { role: "player" },
        "campaign-invite-create-client",
      ),
      client.revokeCampaignInvite(
        inviteId,
        "2026-07-13T00:00:00.000Z",
        "campaign-invite-revoke-client",
      ),
      client.acceptInvite(
        {
          token: "invite_token",
          email: "player@example.test",
          displayName: "Player",
          password: "password123",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "campaign-invite-accept-client",
      ),
      client.previewInvite("invite_token"),
      client.worlds(campaignId),
      client.createWorld(
        campaignId,
        { name: "World", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "world-create-client",
      ),
      client.world(worldId),
      client.updateWorld(
        worldId,
        { name: "World 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "world-update-client",
      ),
      client.deleteWorld(
        worldId,
        "2026-07-13T00:00:00.000Z",
        "world-delete-client",
      ),
      client.worldRecords(campaignId),
      client.createWorldRecord(
        campaignId,
        {
          kind: "location",
          name: "Client location",
          worldId,
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "world-record-create-client",
      ),
      client.updateWorldRecord(
        worldRecordId,
        {
          summary: "Updated client location",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "world-record-update-client",
      ),
      client.updateWorldRecordLifecycle(
        worldRecordId,
        "archived",
        "2026-07-13T00:00:00.000Z",
        "world-record-lifecycle-client",
      ),
      client.deleteWorldRecord(
        worldRecordId,
        "2026-07-13T00:00:00.000Z",
        "world-record-delete-client",
      ),
      client.worldRelations(campaignId),
      client.createWorldRelation(
        campaignId,
        {
          sourceRecordId: worldRecordId,
          targetRecordId: "wrec_target_client",
          type: "related_to",
          worldId,
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "world-relation-create-client",
      ),
      client.updateWorldRelation(
        worldRelationId,
        {
          label: "Updated relation",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "world-relation-update-client",
      ),
      client.deleteWorldRelation(
        worldRelationId,
        "2026-07-13T00:00:00.000Z",
        "world-relation-delete-client",
      ),
      client.scenes(campaignId),
      client.createScene(
        campaignId,
        { name: "Scene", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "scene-create-client",
      ),
      client.duplicateScenes(
        campaignId,
        {
          operationId: "scene-duplication-client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          sources: [{ sceneId, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" }],
          dryRun: true,
        },
        "scene-duplication-preview-client",
      ),
      client.scene(sceneId),
      client.sceneDelegations(sceneId),
      client.updateSceneDelegation(
        sceneId,
        delegatedUserId,
        ["scene.read", "scene.update"],
        "2026-07-13T00:00:00.000Z",
        "scene-delegation-client",
      ),
      client.updateScene(
        sceneId,
        { name: "Scene 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "scene-update-client",
      ),
      client.deleteScene(
        sceneId,
        "2026-07-13T00:00:00.000Z",
        "scene-delete-client",
      ),
      client.sceneVision(sceneId, { previewUserId: "usr_client_player" }),
      client.sampleSceneVision(sceneId, { x: 1, y: 2 }),
      client.measureScenePath(sceneId, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      client.createDifficultTerrain(
        sceneId,
        {
          label: "Rubble",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "terrain-create-client",
      ),
      client.updateDifficultTerrain(
        sceneId,
        terrainRegionId,
        { label: "Deep rubble", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "terrain-update-client",
      ),
      client.deleteDifficultTerrain(
        sceneId,
        terrainRegionId,
        "2026-07-13T00:00:00.000Z",
        "terrain-delete-client",
      ),
      client.setSceneCoverOverride(
        sceneId,
        {
          sourceTokenId: "tok_source",
          targetTokenId: "tok_target",
          level: "half",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "cover-set-client",
      ),
      client.deleteSceneCoverOverride(
        sceneId,
        coverOverrideId,
        "2026-07-13T00:00:00.000Z",
        "cover-delete-client",
      ),
      client.sceneRenderingDiagnostics(sceneId),
      client.createSceneAnnotation(
        sceneId,
        {
          kind: "ping",
          points: [{ x: 1, y: 2 }],
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "annotation-create-client",
      ),
      client.updateSceneAnnotation(
        sceneId,
        annotationId,
        {
          label: "Updated annotation",
          templateShape: "line",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "annotation-update-client",
      ),
      client.deleteSceneAnnotation(
        sceneId,
        annotationId,
        "2026-07-13T00:00:00.000Z",
        "annotation-delete-client",
      ),
      client.fogPresets(campaignId),
      client.createFogPreset(
        campaignId,
        {
          name: "Preset",
          sceneId,
          expectedSceneUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "fog-preset-create-client",
      ),
      client.deleteFogPreset(
        campaignId,
        "preset_client",
        "2026-07-13T00:00:00.000Z",
        "fog-preset-delete-client",
      ),
      client.createFogRegion(
        sceneId,
        { shape: "circle", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "fog-create-client",
      ),
      client.updateFogRegion(
        sceneId,
        fogId,
        { shape: "polygon", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "fog-update-client",
      ),
      client.deleteFogRegion(
        sceneId,
        fogId,
        "2026-07-13T00:00:00.000Z",
        "fog-delete-client",
      ),
      client.fogHistory(sceneId),
      client.undoFog(sceneId, "2026-07-13T00:00:00.000Z", "fog-undo-client"),
      client.sceneEdits(sceneId),
      client.undoScene(
        sceneId,
        "2026-07-13T00:00:00.000Z",
        "scene-undo-client",
      ),
      client.applyFogPreset(
        sceneId,
        {
          presetId: "preset_client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "fog-preset-apply-client",
      ),
      client.createWall(
        sceneId,
        {
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "wall-create-client",
      ),
      client.updateWall(
        sceneId,
        wallId,
        { blocksVision: false, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "wall-update-client",
      ),
      client.deleteWall(
        sceneId,
        wallId,
        "2026-07-13T00:00:00.000Z",
        "wall-delete-client",
      ),
      client.createLight(
        sceneId,
        {
          x: 1,
          y: 1,
          radius: 5,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "light-create-client",
      ),
      client.updateLight(
        sceneId,
        lightId,
        { radius: 10, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "light-update-client",
      ),
      client.deleteLight(
        sceneId,
        lightId,
        "2026-07-13T00:00:00.000Z",
        "light-delete-client",
      ),
      client.applyAiEditLayerToTarget(sceneId),
      client.assets(campaignId),
      client.assetStorage(campaignId),
      client.createAsset(campaignId, { name: "Asset" }, "asset-create-client"),
      client.uploadAsset(campaignId, new Blob(["asset"]), {
        contentType: "image/svg+xml",
        fileName: "map.svg",
        idempotencyKey: "asset-upload-client",
      }),
      client.updateAsset(
        assetId,
        { name: "Asset 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "asset-update-client",
      ),
      client.updateAssetLifecycle(
        assetId,
        { status: "archived", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "asset-lifecycle-client",
      ),
      client.assetDeliveryUrl(assetId),
      client.tokens(sceneId),
      client.createToken(
        sceneId,
        { name: "Token", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "token-create-client",
      ),
      client.updateToken(
        tokenId,
        { name: "Token 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "token-update-client",
      ),
      client.targetToken(
        tokenId,
        true,
        "2026-07-13T00:00:00.000Z",
        "token-target-client",
      ),
      client.deleteToken(
        tokenId,
        "2026-07-13T00:00:00.000Z",
        "token-delete-client",
      ),
      client.actors(campaignId),
      client.createActor(
        campaignId,
        { name: "Actor", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "actor-create-client",
      ),
      client.actor(actorId),
      client.updateActor(
        actorId,
        { name: "Actor 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "actor-update-client",
      ),
      client.endDnd5eSrdConcentration(
        actorId,
        { prepare: true, reason: "Voluntary" },
        { idempotencyKey: "concentration-preview-client" },
      ),
      client.deleteActor(
        actorId,
        "2026-07-13T00:00:00.000Z",
        "actor-delete-client",
      ),
      client.items(campaignId),
      client.createItem(
        campaignId,
        { name: "Item", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "item-create-client",
      ),
      client.item(itemId),
      client.updateItem(
        itemId,
        { name: "Item 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "item-update-client",
      ),
      client.deleteItem(
        itemId,
        "2026-07-13T00:00:00.000Z",
        "item-delete-client",
      ),
      client.journals(campaignId),
      client.createJournal(
        campaignId,
        { title: "Note" },
        { idempotencyKey: "journal-create-client" },
      ),
      client.journal(entryId),
      client.updateJournal(
        entryId,
        { title: "Note 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        { idempotencyKey: "journal-update-client" },
      ),
      client.journalBacklinks(entryId),
      client.journalHistory(entryId),
      client.reviewJournalCanon(
        entryId,
        { status: "canonical", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "journal-canon-client",
      ),
      client.deleteJournal(
        entryId,
        "2026-07-13T00:00:00.000Z",
        "journal-delete-client",
      ),
      client.handouts(campaignId),
      client.createHandout(
        campaignId,
        { title: "Handout", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "handout-create-client",
      ),
      client.handout(handoutId),
      client.updateHandout(
        handoutId,
        { title: "Handout 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "handout-update-client",
      ),
      client.markHandoutRead(handoutId),
      client.deleteHandout(
        handoutId,
        "2026-07-13T00:00:00.000Z",
        "handout-delete-client",
      ),
      client.chat(campaignId),
      client.sendChat({ campaignId, body: "Hello" }, "chat-create-client"),
      client.editChat(
        messageId,
        "Edited",
        "2026-07-13T00:00:00.000Z",
        "chat-edit-client",
      ),
      client.moderateChat(
        messageId,
        "reviewed",
        "2026-07-13T00:00:00.000Z",
        "chat-moderate-client",
      ),
      client.deleteChat(
        messageId,
        "2026-07-13T00:00:00.000Z",
        "chat-delete-client",
      ),
      client.exportChat(campaignId),
      client.roll({ campaignId, formula: "1d20" }, "dice-roll-client"),
      client.rolls(campaignId),
      client.verifyRoll(campaignId, rollId),
      client.diceMacros(campaignId),
      client.createDiceMacro(
        campaignId,
        { name: "Macro", formula: "1d20" },
        "macro-create-client",
      ),
      client.updateDiceMacro(
        macroId,
        { name: "Macro 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "macro-update-client",
      ),
      client.deleteDiceMacro(
        macroId,
        "2026-07-13T00:00:00.000Z",
        "macro-delete-client",
      ),
      client.audioTracks(campaignId),
      client.createAudioTrack(
        campaignId,
        {
          name: "Ambience",
          url: "https://example.test/ambience.mp3",
        },
        "audio-create-client",
      ),
      client.updateAudioTrack(
        audioTrackId,
        { playing: true, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "audio-update-client",
      ),
      client.deleteAudioTrack(
        audioTrackId,
        "2026-07-13T00:00:00.000Z",
        "audio-delete-client",
      ),
      client.combats(campaignId),
      client.combatAudit(combatId),
      client.awardCombatRewards(
        combatId,
        { totalXp: 100, recipientActorIds: [actorId] },
        "combat-reward-client",
      ),
      client.createCombatEnvironmentMechanic(
        combatId,
        {
          kind: "regional_effect",
          name: "Regional effect",
          description: "A visible prompt.",
          schedule: {
            timing: "round_start",
            startsAtRound: 1,
            intervalRounds: 1,
          },
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "combat-mechanic-create-client",
      ),
      client.updateCombatEnvironmentMechanic(
        combatId,
        combatMechanicId,
        {
          enabled: false,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "combat-mechanic-update-client",
      ),
      client.deleteCombatEnvironmentMechanic(
        combatId,
        combatMechanicId,
        "2026-07-13T00:00:00.000Z",
        "combat-mechanic-delete-client",
      ),
      client.triggerCombatEnvironmentMechanic(
        combatId,
        combatMechanicId,
        {
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "combat-mechanic-trigger-client",
      ),
      client.previewCombatEffectSchedule(
        combatId,
        { phase: "start_round", prepare: true },
        { idempotencyKey: "combat-effect-preview-client" },
      ),
      client.advanceCombatEffectSchedule(
        combatId,
        {
          preparedPreviewKey: "combat-effect-preview-client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "combat-effect-advance-client" },
      ),
      client.previewDnd5eSpellHelper(campaignId, systemId, {
        casterActorId: actorId,
        spellId: "magic-missile",
        targetActorIds: [],
        slotLevel: 1,
      }),
      client.startCombat(
        campaignId,
        { combatants: [], expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "combat-create-client",
      ),
      client.startReviewedCombat(
        campaignId,
        {
          sceneId,
          participants: [{ tokenId, initiativeMode: "manual", initiative: 12 }],
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "combat-start-client",
      ),
      client.updateCombat(
        combatId,
        { round: 2, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "combat-update-client",
      ),
      client.rollNpcInitiative(
        combatId,
        "2026-07-13T00:00:00.000Z",
        "combat-initiative-client",
      ),
      client.updateCombatant(
        combatId,
        combatantId,
        { defeated: true, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "combatant-update-client",
      ),
      client.confirmCombatAction(
        combatId,
        combatActionId,
        {
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedActorUpdatedAt: { [actorId]: "2026-07-13T00:00:00.000Z" },
          expectedItemUpdatedAt: {},
        },
        { idempotencyKey: "combat-action-confirm-client" },
      ),
      client.rejectCombatAction(
        combatId,
        combatActionId,
        {
          reason: "Needs manual adjustment",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "combat-action-reject-client",
      ),
      client.endCombat(
        combatId,
        "2026-07-13T00:00:00.000Z",
        "combat-delete-client",
      ),
      client.encounters(campaignId),
      client.createEncounter(
        campaignId,
        { name: "Encounter", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "encounter-create-client",
      ),
      client.encounter(encounterId),
      client.updateEncounter(
        encounterId,
        { name: "Encounter 2", expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "encounter-update-client",
      ),
      client.deleteEncounter(
        encounterId,
        "2026-07-13T00:00:00.000Z",
        "encounter-delete-client",
      ),
      client.proposals(campaignId),
      client.createProposal(campaignId, { title: "Proposal" }),
      client.approveProposal(proposalId),
      client.applyProposal(proposalId),
      client.revertProposal(proposalId),
      client.rejectProposal(proposalId),
      client.aiPolicy(campaignId),
      client.updateAiPolicy(
        campaignId,
        {
          expectedRevision: 0,
          enabled: true,
          contextScopes: ["public"],
          providerTransmissionDisclosure:
            "Campaign-visible context may be sent to the configured provider.",
          retentionDays: 30,
        },
        { idempotencyKey: "ai-policy-client" },
      ),
      client.previewAiPrivacy(campaignId, { mode: "expired", dryRun: true }),
      client.pruneAiPrivacy(
        campaignId,
        {
          mode: "expired",
          dryRun: true,
        },
        { idempotencyKey: "ai-privacy-prune-client" },
      ),
      client.aiThreads(campaignId),
      client.createAiThread(campaignId, { prompt: "Plan" }),
      client.aiUsage(campaignId),
      client.aiEvaluations(campaignId),
      client.createAiEvaluation(campaignId, { name: "Eval" }),
      client.aiMemory(campaignId),
      client.createAiMemory(campaignId, { text: "Fact" }),
      client.extractAiMemory(campaignId, { transcript: "Transcript" }),
      client.approveAiMemory(factId),
      client.aiMemoryFact(factId),
      client.updateAiMemory(factId, { subject: "Updated" }),
      client.rejectAiMemory(factId),
      client.deleteAiMemory(factId),
      client.aiToolCalls(campaignId),
      client.retryAiToolCall(campaignId, toolCallId),
      client.aiSessionRecap(campaignId, { transcript: "Transcript" }),
      client.aiEncounterDesign(campaignId, { prompt: "Encounter" }),
      client.aiGenerateMapAsset(campaignId, { prompt: "Map", sceneId }),
      client.aiGenerateTokenAsset(campaignId, { prompt: "Token", tokenId }),
      client.mcp({
        jsonrpc: "2.0",
        id: "mcp_client",
        method: "tools/list",
        params: { campaignId },
      }),
      client.submitBoardCapture(requestId, { error: "not available" }),
      client.plugins(),
      client.registerPlugin(
        { campaignId, packagePath: pluginId },
        "plugin-register-client",
      ),
      client.syncPluginRegistry(
        {
          expectedRegistryRevision:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        "plugin-registry-sync-client",
      ),
      client.plugins(campaignId),
      client.installPlugin(
        campaignId,
        pluginId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "plugin-install-client",
      ),
      client.pluginStorage(campaignId, pluginId),
      client.pluginStorageEntry(campaignId, pluginId, pluginKey),
      client.setPluginStorageEntry(
        campaignId,
        pluginId,
        pluginKey,
        {
          enabled: true,
        },
        { expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "plugin-storage-set-client",
      ),
      client.deletePluginStorageEntry(
        campaignId,
        pluginId,
        pluginKey,
        "2026-07-13T00:00:00.000Z",
        "plugin-storage-delete-client",
      ),
      client.runPluginChatCommand(
        campaignId,
        pluginId,
        { command: "/spark" },
        "plugin-command-client",
      ),
      client.systems(),
      client.registerSystem(
        campaignId,
        {
          id: systemId,
          name: "Client Test System",
          version: "1.0.0",
          compatibleCore: ">=0.3.0",
          entrypoints: {},
          schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
          permissions: [],
          capabilities: ["data-model"],
        },
        "system-register-client",
      ),
      client.systems(campaignId),
      client.campaignCompatibility(campaignId),
      client.installSystem(
        campaignId,
        systemId,
        "2026-07-13T00:00:00.000Z",
        "system-install-client",
      ),
      client.systemCharacterTemplates(campaignId, systemId),
      client.systemCharacterOrigins(campaignId, systemId),
      client.createSystemCharacter(
        campaignId,
        systemId,
        { name: "Character" },
        "system-character-create-client",
      ),
      client.createSystemMonster(
        campaignId,
        systemId,
        { name: "Monster" },
        "system-monster-create-client",
      ),
      client.placeEncounterMonsters(
        sceneId,
        {
          systemId,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          placements: [{ threatId: "guard", x: 100, y: 100, width: 50, height: 50 }],
        },
        "encounter-monster-placement-client",
      ),
      client.importSystemCharacter(
        campaignId,
        systemId,
        { name: "Import" },
        "system-character-import-client",
      ),
      client.systemEncounterThreats(campaignId, systemId),
      client.systemEncounterPlan(campaignId, systemId, {
        partyActorIds: [],
        threats: [{ id: "guard", count: 1 }],
      }),
      client.systemCompendium(campaignId, systemId),
      client.dndCustomContent(campaignId),
      client.previewDndCustomContent(campaignId, customContentDraft),
      client.createDndCustomContent(
        campaignId,
        {
          ...customContentDraft,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "custom-create-client",
      ),
      client.updateDndCustomContent(
        campaignId,
        itemId,
        {
          ...customContentDraft,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "custom-update-client",
      ),
      client.deleteDndCustomContent(
        campaignId,
        itemId,
        "2026-07-13T00:00:00.000Z",
        "custom-delete-client",
      ),
      client.dndMonsterTemplates(campaignId),
      client.previewDndMonsterTemplate(campaignId, monsterTemplateDraft),
      client.createDndMonsterTemplate(
        campaignId,
        {
          ...monsterTemplateDraft,
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "monster-template-create-client",
      ),
      client.updateDndMonsterTemplate(
        campaignId,
        monsterTemplateId,
        {
          ...monsterTemplateDraft,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "monster-template-update-client",
      ),
      client.deleteDndMonsterTemplate(
        campaignId,
        monsterTemplateId,
        "2026-07-13T00:00:00.000Z",
        "monster-template-delete-client",
      ),
      client.dndMonsterBases(campaignId),
      client.previewDndMonsterVariant(campaignId, monsterVariantDraft),
      client.createDndMonsterVariant(
        campaignId,
        {
          ...monsterVariantDraft,
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "monster-variant-create-client",
      ),
      client.dndCharacterReviews(campaignId),
      client.updateDndCharacterReviewPolicy(
        campaignId,
        {
          mode: "required",
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "character-review-policy-client",
      ),
      client.submitDndCharacterReview(
        campaignId,
        actorId,
        {
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedItemUpdatedAt: { [itemId]: "2026-07-13T00:00:00.000Z" },
        },
        "character-review-submit-client",
      ),
      client.decideDndCharacterReview(
        campaignId,
        actorId,
        {
          action: "approve",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedFingerprint: "sha256:reviewed",
        },
        "character-review-decision-client",
      ),
      client.dndInventory(campaignId, actorId),
      client.createDndPartyStash(
        campaignId,
        { expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "dnd-stash-client",
      ),
      client.createDndMerchant(
        campaignId,
        {
          name: "Quartermaster",
          catalog: [],
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-merchant-create-client",
      ),
      client.updateDndMerchant(
        campaignId,
        merchantId,
        {
          description: "Camp supplies",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedCampaignUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-merchant-update-client",
      ),
      client.updateDndInventoryItem(
        campaignId,
        itemId,
        {
          quantity: 2,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedOwnerUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-item-update-client",
      ),
      client.transferDndInventoryItem(
        campaignId,
        itemId,
        {
          quantity: 1,
          destination: { kind: "actor", actorId },
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedSourceUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedDestinationUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-item-transfer-client",
      ),
      client.consumeDndAmmunition(
        campaignId,
        weaponItemId,
        {
          ammunitionItemId: "ammo_client",
          amount: 1,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedAmmunitionUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-ammunition-client",
      ),
      client.buyFromDndMerchant(
        campaignId,
        merchantId,
        {
          actorId,
          catalogEntryId: "rations",
          quantity: 1,
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedMerchantUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-buy-client",
      ),
      client.sellToDndMerchant(
        campaignId,
        merchantId,
        {
          actorId,
          itemId,
          quantity: 1,
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedMerchantUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedItemUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-sell-client",
      ),
      client.recordDndCombatLoot(
        combatId,
        {
          stashId: "stash_client",
          items: [{ name: "Gem", type: "gear", quantity: 1, weightLb: 0 }],
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedStashUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-combat-loot-client",
      ),
      client.claimDndLoot(
        campaignId,
        itemId,
        {
          actorId,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedStashUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-loot-claim-client",
      ),
      client.assignDndLoot(
        campaignId,
        itemId,
        {
          action: "assign",
          actorId,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedStashUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "dnd-loot-assign-client",
      ),
      client.addSystemCompendiumToActor(
        campaignId,
        systemId,
        actorId,
        {
          entryId: "spell",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "compendium-add-client",
      ),
      client.purchaseSystemEquipment(
        campaignId,
        systemId,
        actorId,
        {
          entryId: "rope",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "compendium-purchase-client",
      ),
      client.addSystemActorCondition(
        campaignId,
        systemId,
        actorId,
        {
          conditionId,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "condition-apply-client",
      ),
      client.removeSystemActorCondition(
        campaignId,
        systemId,
        actorId,
        conditionId,
        { expectedUpdatedAt: "2026-07-13T00:00:00.000Z" },
        "condition-remove-client",
      ),
      client.systemActorAdvancement(campaignId, systemId, actorId),
      client.systemActorRulesValidation(campaignId, systemId, actorId),
      client.systemActorCalculationExplanation(campaignId, systemId, actorId),
      client.calculationOverrides(campaignId, actorId),
      client.createCalculationOverride(
        campaignId,
        actorId,
        {
          fieldId: "armor_class",
          source: "gm_manual",
          effectiveValue: 17,
          reason: "Client conformance coverage",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "calculation-override-create-client",
      ),
      client.clearCalculationOverride(
        calculationOverrideId,
        {
          reason: "Client conformance coverage complete",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "calculation-override-clear-client",
      ),
      client.systemControlledCreatures(campaignId, systemId),
      client.previewSystemControlledCreature(
        campaignId,
        systemId,
        controlledRequest,
      ),
      client.confirmSystemControlledCreature(
        campaignId,
        systemId,
        {
          request: controlledRequest,
          previewToken: "reviewed",
          expectedUpdatedAt: controlledRevisions,
        },
        "controlled-confirm-client",
      ),
      client.commandSystemControlledCreature(
        campaignId,
        systemId,
        actorId,
        { expectedUpdatedAt: controlledRevisions },
        "controlled-command-client",
      ),
      client.endSystemControlledCreature(
        campaignId,
        systemId,
        actorId,
        { reason: "dismissed", expectedUpdatedAt: controlledRevisions },
        "controlled-end-client",
      ),
      client.endSystemControlledCreatureConcentration(
        campaignId,
        systemId,
        {
          sourceActorId: actorId,
          groupId: "spell:client",
          expectedUpdatedAt: controlledRevisions,
        },
        "controlled-concentration-client",
      ),
      client.systemActorRulesPreview(campaignId, systemId, actorId, {
        operation: "typed-damage",
        amount: 5,
        damageType: "fire",
      }),
      client.applyDnd5eSrdTypedDamage(
        campaignId,
        systemId,
        actorId,
        {
          preparedPreviewKey: "typed-damage-preview-client",
          expectedActorUpdatedAt: { [actorId]: "2026-07-13T00:00:00.000Z" },
          expectedItemUpdatedAt: {},
        },
        { idempotencyKey: "typed-damage-apply-client" },
      ),
      client.cancelDnd5eSrdPendingAdvancement(
        campaignId,
        systemId,
        actorId,
        {
          pendingAdvancementId: "padv_client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "advancement-cancel-client" },
      ),
      client.undoDndRulesMutation(
        campaignId,
        dndRulesMutationId,
        {
          expectedActorUpdatedAt: { [actorId]: "2026-07-13T00:00:01.000Z" },
          expectedItemUpdatedAt: {},
        },
        { idempotencyKey: "rules-mutation-undo-client" },
      ),
      client.previewDnd5eSrdSpellPreparation(
        campaignId,
        systemId,
        actorId,
        {
          selectedSpellIds: [],
          timing: "long-rest",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedItemUpdatedAt: {},
        },
        "spell-preparation-preview-client",
      ),
      client.applyDnd5eSrdSpellPreparation(
        campaignId,
        systemId,
        actorId,
        {
          preparedPreviewKey: "spell-preparation-preview-client",
          expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
          expectedItemUpdatedAt: {},
        },
        "spell-preparation-apply-client",
      ),
      client.changeSystemActorAttunement(
        campaignId,
        systemId,
        actorId,
        {
          itemId,
          attuned: true,
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "attunement-client" },
      ),
      client.advanceSystemActor(
        campaignId,
        systemId,
        actorId,
        {
          optionId: "hp",
          preparedPreviewKey: "advancement-preview-client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "advancement-commit-client" },
      ),
      client.restSystemActor(
        campaignId,
        systemId,
        actorId,
        {
          restType: "short",
          preparedPreviewKey: "rest-preview-client",
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        { idempotencyKey: "rest-commit-client" },
      ),
      client.systemActorSheet(campaignId, systemId, actorId),
      client.grantDnd5eSrdHeroicInspiration(campaignId, actorId, {
        expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
      }, { idempotencyKey: "heroic-inspiration-grant-client" }),
      client.rerollDnd5eSrdHeroicInspiration(campaignId, actorId, {
        originalRollId: rollId,
        selectedTermIndex: 0,
        selectedResultIndex: 0,
        expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z",
      }, { idempotencyKey: "heroic-inspiration-reroll-client" }),
      client.rollSystemActor(campaignId, systemId, actorId, {
        actionId: "attack",
      }),
      client.contentImports(campaignId),
      client.previewContentImport(
        campaignId,
        { source: "manual" },
        "content-preview-client",
      ),
      client.analyzePdfContentImport(campaignId, new Blob(["pdf"]), {
        sourceName: "module.pdf",
        idempotencyKey: "content-pdf-client",
      }),
      client.contentImport(importId),
      client.applyContentImport(
        importId,
        {
          selectedEntityIds: [],
          expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
        },
        "content-apply-client",
      ),
      client.rollbackContentImport(
        importId,
        "2026-07-13T00:00:00.000Z",
        "content-rollback-client",
      ),
      client.deleteContentImport(
        importId,
        "2026-07-13T00:00:00.000Z",
        "content-delete-client",
      ),
      client.exportCampaign(campaignId),
      client.exportCampaignStream(campaignId),
      client.dogfoodReportBundle(campaignId),
      client.campaignArchiveImportOperations(campaignId),
      client.previewCampaignArchiveImportRollback(campaignId, archiveImportOperationId),
      client.rollbackCampaignArchiveImport(campaignId, archiveImportOperationId, "2026-07-13T00:00:00.000Z", "archive-import-rollback-client"),
      client.importCampaign({ format: "ottx" }, "campaign-import-client"),
      client.importCampaignStream(
        new Blob(["framed archive"]),
        "campaign-import-stream-client",
      ),
    ]);

    const coveredRoutes = new Set(calls.map(normalizeCall));
    const missing = publicOpenApiRoutes().filter(
      (route) => !coveredRoutes.has(route),
    );
    expect(missing).toEqual([]);
  });
});

function publicOpenApiRoutes(): string[] {
  return Object.entries(openApiSpec.paths)
    .flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    )
    .filter((route) => !isExcludedRoute(route))
    .sort();
}

function isExcludedRoute(route: string): boolean {
  const [, path] = route.split(" ");
  return (
    path === "/api/v1/openapi.json" ||
    path === "/api/v1/realtime" ||
    path === "/api/v1/assets/{assetId}/blob" ||
    route === "GET /api/v1/agent/board-captures/{captureHandle}" ||
    path === "/api/v1/auth/oidc/callback" ||
    Boolean(path?.startsWith("/api/v1/admin/")) ||
    Boolean(path?.startsWith("/api/v1/scim/"))
  );
}

function normalizeCall(call: string): string {
  return call
    .replace(campaignId, "{campaignId}")
    .replace(sceneId, "{sceneId}")
    .replace(assetId, "{assetId}")
    .replace(tokenId, "{tokenId}")
    .replace(factId, "{factId}")
    .replace(toolCallId, "{toolCallId}")
    .replace(combatActionId, "{actionId}")
    .replace(combatMechanicId, "{mechanicId}")
    .replace(dndRulesMutationId, "{mutationId}")
    .replace(actorId, "{actorId}")
    .replace(itemId, "{itemId}")
    .replace(merchantId, "{merchantId}")
    .replace(weaponItemId, "{weaponItemId}")
    .replace(entryId, "{entryId}")
    .replace(messageId, "{messageId}")
    .replace(macroId, "{macroId}")
    .replace(rollId, "{rollId}")
    .replace(audioTrackId, "{trackId}")
    .replace(combatId, "{combatId}")
    .replace(combatantId, "{combatantId}")
    .replace(proposalId, "{proposalId}")
    .replace(archiveImportOperationId, "{operationId}")
    .replace(importId, "{importId}")
    .replace(pluginId, "{pluginId}")
    .replace(pluginKey, "{key}")
    .replace(systemId, "{systemId}")
    .replace(conditionId, "{conditionId}")
    .replace(monsterTemplateId, "{templateId}")
    .replace(inviteId, "{inviteId}")
    .replace(campaignSessionId, "{sessionId}")
    .replace(characterTransferId, "{transferId}")
    .replace(sessionId, "{sessionId}")
    .replace(requestId, "{captureHandle}")
    .replace(fogId, "{fogId}")
    .replace(wallId, "{wallId}")
    .replace(lightId, "{lightId}")
    .replace(annotationId, "{annotationId}")
    .replace(webhookId, "{webhookId}")
    .replace(webhookDeliveryId, "{deliveryId}")
    .replace(delegatedUserId, "{userId}")
    .replace(terrainRegionId, "{regionId}")
    .replace(coverOverrideId, "{overrideId}")
    .replace(organizationMemberId, "{memberId}")
    .replace(campaignMemberId, "{memberId}")
    .replace(encounterId, "{encounterId}")
    .replace(handoutId, "{handoutId}")
    .replace(worldRecordId, "{recordId}")
    .replace(worldRelationId, "{relationId}")
    .replace(calculationOverrideId, "{overrideId}")
    .replace(worldId, "{worldId}")
    .replace("preset_client", "{presetId}");
}
