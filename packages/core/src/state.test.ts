import { describe, expect, it } from "vitest";
import { aiMemoryFactStatus, makeArchive, normalizeEngineState, seedState } from "./state.js";
import type { Scene } from "./types.js";

describe("development seed", () => {
  it("uses the D&D-first campaign system for the tokened demo character", () => {
    const state = seedState();
    const campaign = state.campaigns.find((item) => item.id === "camp_demo")!;
    const actor = state.actors.find((item) => item.id === "act_valen")!;

    expect(campaign.defaultSystemId).toBe("dnd-5e-srd");
    expect(actor.systemId).toBe(campaign.defaultSystemId);
    expect(state.actors).toContainEqual(expect.objectContaining({ id: "act_generic_demo", systemId: "generic-fantasy" }));
  });
});

describe("campaign archives", () => {
  it("uses one campaign scene collection to archive scenes and tokens", () => {
    const state = seedState();
    const campaign = state.campaigns.find((item) => item.id === "camp_demo")!;
    const baseScene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const baseToken = state.tokens.find((item) => item.id === "tok_valen")!;
    state.campaigns.push({ ...campaign, id: "camp_other", name: "Other Campaign" });
    state.scenes.push(
      { ...baseScene, id: "scn_side_room", name: "Side Room", active: false, sortOrder: 2 },
      { ...baseScene, id: "scn_other_campaign", campaignId: "camp_other", name: "Other Campaign Scene", active: false, sortOrder: 1 }
    );
    state.tokens.push(
      { ...baseToken, id: "tok_side_room", sceneId: "scn_side_room" },
      { ...baseToken, id: "tok_other_campaign", sceneId: "scn_other_campaign" },
      { ...baseToken, id: "tok_missing_scene", sceneId: "scn_missing" }
    );
    let sceneFilterCalls = 0;
    state.scenes = new Proxy(state.scenes, {
      get(target, property, receiver) {
        if (property === "filter") {
          return (predicate: (scene: Scene, index: number, scenes: Scene[]) => boolean, thisArg?: unknown): Scene[] => {
            sceneFilterCalls += 1;
            return target.filter(predicate, thisArg);
          };
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const archive = makeArchive(state, "camp_demo");

    expect(archive.data.scenes.map((scene) => scene.id).sort()).toEqual(["scn_side_room", "scn_vault_entry"]);
    expect(archive.data.tokens.map((token) => token.id).sort()).toEqual(["tok_side_room", "tok_valen"]);
    expect(sceneFilterCalls).toBe(1);
  });

  it("returns a detached snapshot that cannot mutate live campaign state", () => {
    const state = seedState();
    const archive = makeArchive(state, "camp_demo");

    archive.data.campaigns[0]!.name = "Changed in archive";
    (archive.data.actors[0]!.data.hp as { current: number }).current = 0;
    archive.data.tokens[0]!.metadata.changed = true;

    expect(state.campaigns[0]!.name).toBe("The Ember Vault");
    expect((state.actors[0]!.data.hp as { current: number }).current).toBe(18);
    expect(state.tokens[0]!.metadata).toEqual({});
  });

  it("omits installation-local webhook targets, secrets, and delivery ledgers from portable archives", () => {
    const state = seedState();
    const now = "2026-07-13T12:00:00.000Z";
    state.campaignWebhooks.push({
      id: "whk_archive_secret",
      campaignId: "camp_demo",
      name: "Private integration",
      url: "https://hooks.example.test/private-path",
      eventTypes: ["campaign.updated"],
      enabled: true,
      signingSecret: "otte_whsec_must_never_enter_archive",
      secretHint: "rchive",
      createdByUserId: "usr_demo_gm",
      updatedByUserId: "usr_demo_gm",
      createdAt: now,
      updatedAt: now,
    });
    state.campaignWebhookDeliveries.push({
      id: "whdel_archive_secret",
      campaignId: "camp_demo",
      webhookId: "whk_archive_secret",
      eventId: "evt_archive_secret",
      eventType: "campaign.updated",
      occurredAt: now,
      attempt: 1,
      status: "failed",
      errorCode: "network_error",
      createdAt: now,
      updatedAt: now,
    });

    const archive = makeArchive(state, "camp_demo");
    const serialized = JSON.stringify(archive);

    expect(archive.data.campaignWebhooks).toEqual([]);
    expect(archive.data.campaignWebhookDeliveries).toEqual([]);
    expect(serialized).not.toContain("otte_whsec_must_never_enter_archive");
    expect(serialized).not.toContain("hooks.example.test");
    expect(serialized).not.toContain("whdel_archive_secret");
  });

  it("normalizes additive handout, memory, and campaign-session state without breaking legacy rows", () => {
    const state = seedState();
    const now = "2026-07-09T00:00:00.000Z";
    state.handouts.push({
      id: "hnd_legacy",
      campaignId: "camp_demo",
      title: "Legacy Handout",
      body: "Imported before audience and read receipts existed.",
      visibility: "public",
      assetIds: [],
      createdAt: now,
      updatedAt: now
    });
    state.aiMemory.push({
      id: "mem_legacy",
      campaignId: "camp_demo",
      text: "An already approved legacy fact.",
      visibility: "public",
      sourceIds: [],
      approvedByUserId: "usr_demo_gm",
      createdAt: now,
      updatedAt: now
    });
    state.campaignSessions.push({
      id: "cses_1",
      campaignId: "camp_demo",
      status: "planned",
      title: "Session 1",
      number: 1,
      agenda: "Open the vault",
      notes: "",
      sceneIds: ["scn_vault_entry"],
      encounterIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
      createdAt: now,
      updatedAt: now
    });

    const normalized = normalizeEngineState(state);
    expect(normalized.handouts.at(-1)).toMatchObject({ visibleToUserIds: [], visibleToActorIds: [], tags: [], readByUserIds: [], createdBy: "usr_demo_gm", updatedBy: "usr_demo_gm" });
    expect(normalized.aiMemory.at(-1)).toMatchObject({ type: "canon_fact", status: "approved" });
    expect(aiMemoryFactStatus(normalized.aiMemory.at(-1)!)).toBe("approved");
    expect(makeArchive(normalized, "camp_demo").data.campaignSessions).toHaveLength(1);
  });
});
