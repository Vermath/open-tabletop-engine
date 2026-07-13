import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  createTimestamped,
  type CampaignSession,
  type CampaignMember,
  type ChatMessage,
  type Combat,
  type DiceRoll,
  type Encounter,
  type EngineState,
  type OrganizationMember,
  type Proposal,
  type User,
  type UserSession,
  type World,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

class CountingMemoryStateStore extends MemoryStateStore {
  saveCount = 0;

  override save(): void {
    this.saveCount += 1;
  }
}

class ReplaceObservingMemoryStateStore extends MemoryStateStore {
  replacedState?: EngineState;

  override replace(state: EngineState): void {
    this.replacedState = structuredClone(state);
    super.replace(state);
  }
}

describe("feature completeness regressions", () => {
  it("validates campaign updates and emits complete campaign and encounter lifecycle signals", async () => {
    const store = new CountingMemoryStateStore();
    const { token } = seedSession(store, "usr_demo_gm");
    const app = await buildApp({ store });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const realtime = await openRealtime(app, token);

    try {
      const originalCampaign = structuredClone(
        store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!,
      );
      const baselineSaveCount = store.saveCount;
      const baselineAuditCount = store.state.auditLogs.filter(
        (entry) => entry.action === "campaign.update",
      ).length;

      for (const payload of [
        { name: 42 },
        { defaultSystemId: "missing-system" },
        { visibility: "friends" },
      ]) {
        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/campaigns/camp_demo",
          headers: gmHeaders,
          payload,
        });
        expect(response.statusCode).toBe(400);
      }

      expect(
        store.state.campaigns.find((campaign) => campaign.id === "camp_demo"),
      ).toEqual(originalCampaign);
      expect(store.saveCount).toBe(baselineSaveCount);
      expect(
        store.state.auditLogs.filter((entry) => entry.action === "campaign.update"),
      ).toHaveLength(baselineAuditCount);
      expect(realtime.messages.some((message) => message.type === "campaign.updated")).toBe(false);

      const campaignUpdated = realtime.waitFor("campaign.updated", "camp_demo");
      const updated = await app.inject({
        method: "PATCH",
        url: "/api/v1/campaigns/camp_demo",
        headers: gmHeaders,
        payload: {
          name: "  Ember Vault Revised  ",
          description: "  A safer campaign update.  ",
          visibility: "invite_only",
          defaultSystemId: "dnd-5e-srd",
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        name: "Ember Vault Revised",
        description: "A safer campaign update.",
        visibility: "invite_only",
        defaultSystemId: "dnd-5e-srd",
      });
      expect(await campaignUpdated).toMatchObject({
        type: "campaign.updated",
        targetId: "camp_demo",
      });
      expect(store.state.auditLogs.at(-1)).toMatchObject({
        action: "campaign.update",
        targetType: "campaign",
        targetId: "camp_demo",
        before: expect.objectContaining({ name: originalCampaign.name }),
        after: expect.objectContaining({
          name: "Ember Vault Revised",
          descriptionLength: "A safer campaign update.".length,
        }),
      });

      const systemActivated = realtime.waitFor("campaign.updated", "camp_demo", 1);
      const activated = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/install",
        headers: gmHeaders,
      });
      expect(activated.statusCode).toBe(200);
      expect(activated.json().campaign.defaultSystemId).toBe("generic-fantasy");
      expect(await systemActivated).toMatchObject({ type: "campaign.updated" });
      expect(store.state.auditLogs.at(-1)).toMatchObject({
        action: "system.activate",
        targetId: "generic-fantasy",
      });

      const encounterCount = store.state.encounters.length;
      const encounterSaveCount = store.saveCount;
      for (const payload of [
        { threats: "skeletal-guard" },
        { threats: [{ id: "skeletal-guard", count: 0 }] },
        { threats: [{ id: "missing-threat", count: 1 }] },
        { partyActorIds: ["missing-actor"] },
        { createEncounter: "yes" },
      ]) {
        const invalidPlan = await app.inject({
          method: "POST",
          url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-plan",
          headers: gmHeaders,
          payload,
        });
        expect(invalidPlan.statusCode).toBe(400);
      }
      expect(store.state.encounters).toHaveLength(encounterCount);
      expect(store.saveCount).toBe(encounterSaveCount);

      const createEncounter = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-plan",
        headers: gmHeaders,
        payload: {
          partyActorIds: [],
          threats: [{ id: "skeletal-guard", count: 2 }],
          createEncounter: true,
          name: "  Regression Encounter  ",
        },
      });
      expect(createEncounter.statusCode).toBe(200);
      expect(createEncounter.json().encounter).toMatchObject({
        name: "Regression Encounter",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        partyActorIds: [],
        threats: [{ id: "skeletal-guard", count: 2 }],
      });
      const encounterId = createEncounter.json().encounter.id as string;
      expect(store.state.encounters).toHaveLength(encounterCount + 1);
      expect(await realtime.waitFor("encounter.created", encounterId)).toMatchObject({
        type: "encounter.created",
        targetId: encounterId,
      });
      expect(store.state.auditLogs.at(-1)).toMatchObject({
        action: "encounter.create",
        targetType: "encounter",
        targetId: encounterId,
      });

      const encounterUpdated = realtime.waitFor("encounter.updated", encounterId);
      const updateEncounter = await app.inject({
        method: "PATCH",
        url: `/api/v1/encounters/${encounterId}`,
        headers: gmHeaders,
        payload: {
          name: "Regression Encounter Revised",
          systemId: "generic-fantasy",
          partyActorIds: [],
          threats: [{ id: "skeletal-guard", count: 3 }],
        },
      });
      expect(updateEncounter.statusCode).toBe(200);
      expect(updateEncounter.json()).toMatchObject({
        name: "Regression Encounter Revised",
        systemId: "generic-fantasy",
        partyActorIds: [],
        threats: [{ id: "skeletal-guard", count: 3 }],
      });
      expect(await encounterUpdated).toMatchObject({ type: "encounter.updated", targetId: encounterId });

      const beforeInvalidPatch = structuredClone(store.state.encounters.find((encounter) => encounter.id === encounterId));
      const invalidPatchSaveCount = store.saveCount;
      const invalidPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/encounters/${encounterId}`,
        headers: gmHeaders,
        payload: { threats: [{ id: "skeletal-guard", count: 100 }] },
      });
      expect(invalidPatch.statusCode).toBe(400);
      expect(store.state.encounters.find((encounter) => encounter.id === encounterId)).toEqual(beforeInvalidPatch);
      expect(store.saveCount).toBe(invalidPatchSaveCount);

      const encounterDeleted = realtime.waitFor("encounter.deleted", encounterId);
      const deleteEncounter = await app.inject({
        method: "DELETE",
        url: `/api/v1/encounters/${encounterId}`,
        headers: gmHeaders,
      });
      expect(deleteEncounter.statusCode).toBe(200);
      expect(deleteEncounter.json()).toMatchObject({ id: encounterId, threats: [{ id: "skeletal-guard", count: 3 }] });
      expect(store.state.encounters.some((encounter) => encounter.id === encounterId)).toBe(false);
      expect(await encounterDeleted).toMatchObject({ type: "encounter.deleted", targetId: encounterId });
      expect(store.state.auditLogs.at(-1)).toMatchObject({ action: "encounter.delete", targetId: encounterId });
    } finally {
      realtime.close();
      await app.close();
    }
  });

  it("returns roll search results only when the caller can read the roll", async () => {
    const store = new MemoryStateStore();
    seedObserver(store);
    const rolls = [
      createTimestamped("roll", {
        id: "roll_search_public",
        campaignId: "camp_demo",
        userId: "usr_demo_player",
        formula: "1d20+4",
        label: "Regression public check",
        visibility: "public" as const,
        terms: [],
        total: 18,
      }) satisfies DiceRoll,
      createTimestamped("roll", {
        id: "roll_search_whisper",
        campaignId: "camp_demo",
        userId: "usr_demo_gm",
        formula: "1d20+7",
        label: "Regression whispered check",
        visibility: "whisper" as const,
        terms: [],
        total: 21,
      }) satisfies DiceRoll,
      createTimestamped("roll", {
        id: "roll_search_gm",
        campaignId: "camp_demo",
        userId: "usr_demo_gm",
        formula: "2d6",
        label: "Regression GM check",
        visibility: "gm_only" as const,
        terms: [],
        total: 9,
      }) satisfies DiceRoll,
    ];
    const whisperMessage = createTimestamped("msg", {
      id: "msg_search_whisper",
      campaignId: "camp_demo",
      userId: "usr_demo_gm",
      type: "roll" as const,
      body: "Regression whispered roll",
      visibility: "whisper" as const,
      recipientUserIds: ["usr_demo_player"],
      rollId: "roll_search_whisper",
    }) satisfies ChatMessage;
    store.state.rolls.push(...rolls);
    store.state.chat.push(whisperMessage);
    store.state.worlds.push(
      createTimestamped("world", {
        id: "world_search_scope",
        campaignId: "camp_demo",
        name: "Search scope",
        description: "A valid world filter for the search regression test",
      }) satisfies World,
    );
    const app = await buildApp({ store });

    try {
      const search = async (userId: string, extra = "") => {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/campaigns/camp_demo/search?q=regression&types=roll${extra}`,
          headers: { "x-user-id": userId },
        });
        expect(response.statusCode).toBe(200);
        return response.json() as Array<{ id: string; type: string; snippet: string }>;
      };

      const gmResults = await search("usr_demo_gm");
      expect(gmResults.map((result) => result.id)).toEqual(
        expect.arrayContaining([
          "roll_search_public",
          "roll_search_whisper",
          "roll_search_gm",
        ]),
      );
      expect(gmResults.every((result) => result.type === "roll")).toBe(true);
      expect(gmResults.find((result) => result.id === "roll_search_public")?.snippet).toContain("1d20+4 = 18");

      const playerResults = await search("usr_demo_player");
      expect(playerResults.map((result) => result.id)).toEqual(
        expect.arrayContaining(["roll_search_public", "roll_search_whisper"]),
      );
      expect(playerResults.map((result) => result.id)).not.toContain("roll_search_gm");

      const rejectedLink = await app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: { "x-user-id": "usr_demo_player" },
        payload: { campaignId: "camp_demo", body: "Spoofed public roll", visibility: "public", rollId: "roll_search_gm" },
      });
      expect(rejectedLink.statusCode).toBe(404);
      store.state.chat.push(
        createTimestamped("msg", {
          campaignId: "camp_demo",
          userId: "usr_demo_player",
          type: "roll" as const,
          body: "Spoofed legacy link",
          visibility: "public" as const,
          recipientUserIds: [],
          rollId: "roll_search_gm",
        }),
      );
      expect((await search("usr_demo_player")).map((result) => result.id)).not.toContain("roll_search_gm");

      const observerResults = await search("usr_search_observer");
      expect(observerResults.map((result) => result.id)).toEqual(["roll_search_public"]);
      expect(await search("usr_demo_gm", "&worldId=world_search_scope")).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("rejects nonmember ownership across every actor creation surface without mutation", async () => {
    const store = new CountingMemoryStateStore();
    const app = await buildApp({ store });

    try {
      const baseline = {
        actors: store.state.actors.length,
        items: store.state.items.length,
        saves: store.saveCount,
      };
      const attempts = [
        {
          url: "/api/v1/campaigns/camp_demo/actors",
          payload: { name: "Invalid owner actor", ownerUserId: "usr_not_a_member" },
        },
        {
          url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters",
          payload: {
            templateId: "guardian",
            name: "Invalid owner character",
            ownerUserId: "usr_not_a_member",
          },
        },
        {
          url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/monsters",
          payload: {
            threatId: "goblin-warrior",
            name: "Invalid owner monster",
            ownerUserId: "usr_not_a_member",
          },
        },
        {
          url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters/import",
          payload: {
            name: "Invalid owner import",
            ownerUserId: "usr_not_a_member",
            data: { level: 2 },
          },
        },
      ];

      for (const attempt of attempts) {
        const response = await app.inject({
          method: "POST",
          url: attempt.url,
          headers: gmHeaders,
          payload: attempt.payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          message: "Actor ownerUserId must reference a member of the same campaign",
        });
      }

      expect(store.state.actors).toHaveLength(baseline.actors);
      expect(store.state.items).toHaveLength(baseline.items);
      expect(store.saveCount).toBe(baseline.saves);
    } finally {
      await app.close();
    }
  });

  it("protects report bundles and actor owner updates at their authorization boundaries", async () => {
    const store = new CountingMemoryStateStore();
    const app = await buildApp({ store });
    try {
      const playerReport = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/dogfood-report-bundle", headers: { "x-user-id": "usr_demo_player" } });
      expect(playerReport.statusCode).toBe(403);
      const gmReport = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/dogfood-report-bundle", headers: gmHeaders });
      expect(gmReport.statusCode).toBe(200);

      const actor = store.state.actors.find((item) => item.id === "act_valen")!;
      const originalOwner = actor.ownerUserId;
      const invalidOwner = await app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: gmHeaders,
        payload: { ownerUserId: "usr_not_a_member" },
      });
      expect(invalidOwner.statusCode).toBe(400);
      expect(actor.ownerUserId).toBe(originalOwner);
    } finally {
      await app.close();
    }
  });

  it("redacts active encounter prep and notifies players when it is deleted", async () => {
    const store = new MemoryStateStore();
    const { token } = seedSession(store, "usr_demo_player");
    const encounter = createTimestamped("enc", {
      id: "enc_player_redaction",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      name: "Visible battle name",
      summary: "SECRET AMBUSH SUMMARY",
      tokenIds: ["tok_valen"],
      difficulty: "deadly",
      partyActorIds: ["act_valen"],
      threats: [{ id: "skeletal-guard", count: 4 }],
    }) satisfies Encounter;
    const combat = createTimestamped("cmb", {
      id: "cmb_player_redaction",
      campaignId: "camp_demo",
      encounterId: encounter.id,
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [],
    }) satisfies Combat;
    const session = createTimestamped("cses", {
      id: "cses_player_redaction",
      campaignId: "camp_demo",
      status: "live" as const,
      title: "Redaction session",
      number: 99,
      agenda: "",
      notes: "",
      sceneIds: [],
      encounterIds: [encounter.id],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies CampaignSession;
    store.state.encounters.push(encounter);
    store.state.combats.push(combat);
    store.state.campaignSessions.push(session);
    const app = await buildApp({ store });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const realtime = await openRealtime(app, token);
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/encounters/${encounter.id}`, headers: { "x-user-id": "usr_demo_player" } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: encounter.id, name: encounter.name, summary: "", tokenIds: [], redacted: true });
      expect(response.json()).not.toHaveProperty("difficulty");
      expect(response.json()).not.toHaveProperty("partyActorIds");
      expect(response.json()).not.toHaveProperty("threats");

      const deletedEvent = realtime.waitFor("encounter.deleted", encounter.id);
      const combatEvent = realtime.waitFor("combat.turnChanged", combat.id);
      const deleted = await app.inject({ method: "DELETE", url: `/api/v1/encounters/${encounter.id}`, headers: gmHeaders });
      expect(deleted.statusCode).toBe(200);
      expect(await deletedEvent).toMatchObject({ type: "encounter.deleted", targetId: encounter.id, payload: expect.objectContaining({ summary: "", tokenIds: [], redacted: true }) });
      expect(await combatEvent).toMatchObject({ type: "combat.turnChanged", targetId: combat.id });
      expect(combat.encounterId).toBeUndefined();
      expect(session.encounterIds).toEqual([]);
    } finally {
      realtime.close();
      await app.close();
    }
  });

  it("removes deleted actors from saved encounter party snapshots", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((item) => item.id === "act_valen")!;
    const encounter = createTimestamped("enc", {
      id: "enc_actor_delete_party",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      name: "Actor delete party",
      summary: "",
      tokenIds: [],
      partyActorIds: [actor.id],
      threats: [],
    }) satisfies Encounter;
    store.state.encounters.push(encounter);
    const app = await buildApp({ store });
    try {
      const deleted = await app.inject({ method: "DELETE", url: `/api/v1/actors/${actor.id}`, headers: gmHeaders });
      expect(deleted.statusCode).toBe(200);
      expect(encounter.partyActorIds).toEqual([]);
      expect(store.state.auditLogs.at(-1)).toMatchObject({ action: "actor.delete", after: expect.objectContaining({ updatedEncounters: 1 }) });
    } finally {
      await app.close();
    }
  });

  it("dependency-closes and validates saved encounter metadata in campaign archives", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((item) => item.id === "act_valen")!;
    const encounter = createTimestamped("enc", {
      id: "enc_archive_party",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      name: "Archive party",
      summary: "",
      tokenIds: [],
      partyActorIds: [actor.id],
      threats: [{ id: "skeletal-guard", count: 1 }],
    }) satisfies Encounter;
    store.state.encounters.push(encounter);
    const app = await buildApp({ store });
    try {
      const selected = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export?scope=selected_collections&collections=encounters",
        headers: gmHeaders,
      });
      expect(selected.statusCode).toBe(200);
      expect(selected.json().data.actors.map((item: { id: string }) => item.id)).toContain(actor.id);

      const invalidArchive = structuredClone(selected.json());
      invalidArchive.data.encounters[0].partyActorIds = ["act_missing_from_archive"];
      const missingParty = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: gmHeaders,
        payload: { archive: invalidArchive, mode: "dry_run" },
      });
      expect(missingParty.statusCode).toBe(400);
      expect(missingParty.json().message).toContain("missing actors record act_missing_from_archive");

      const invalidThreatArchive = structuredClone(selected.json());
      invalidThreatArchive.data.encounters[0].threats = [{ id: "skeletal-guard", count: 100 }];
      const invalidThreat = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: gmHeaders,
        payload: { archive: invalidThreatArchive, mode: "dry_run" },
      });
      expect(invalidThreat.statusCode).toBe(400);
      expect(invalidThreat.json().message).toContain("threat counts must be integers from 1 to 99");
    } finally {
      await app.close();
    }
  });

  it("persists applied recap journals and session pointers in one replacement", async () => {
    const store = new ReplaceObservingMemoryStateStore();
    const session = createTimestamped("cses", {
      id: "cses_atomic_recap",
      campaignId: "camp_demo",
      status: "completed" as const,
      title: "Atomic recap",
      number: 100,
      agenda: "",
      notes: "",
      sceneIds: [],
      encounterIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies CampaignSession;
    const journal = createTimestamped("jnl", {
      id: "jnl_atomic_recap",
      campaignId: "camp_demo",
      title: "Atomic player recap",
      body: "The party returned safely.",
      visibility: "public" as const,
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["recap"],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    });
    const proposal = createTimestamped("prop", {
      id: "prop_atomic_recap",
      campaignId: "camp_demo",
      createdByUserId: "usr_demo_gm",
      createdByType: "ai" as const,
      title: "Atomic recap pack",
      summary: "Apply recap",
      status: "approved" as const,
      changesJson: [{ entity: "journal" as const, action: "create" as const, data: journal as unknown as Record<string, unknown> }],
      diffJson: { sessionId: session.id },
      approvalRequired: true,
      approvedByUserId: "usr_demo_gm",
    }) satisfies Proposal;
    store.state.campaignSessions.push(session);
    store.state.proposals.push(proposal);
    const app = await buildApp({ store });
    try {
      const applied = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: gmHeaders });
      expect(applied.statusCode).toBe(200);
      const replacedSession = store.replacedState?.campaignSessions.find((item) => item.id === session.id);
      expect(replacedSession).toMatchObject({ recapProposalId: proposal.id, recapJournalId: journal.id });
      expect(store.replacedState?.journals.some((item) => item.id === journal.id)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

type RealtimeMessage = {
  type?: string;
  targetId?: string;
  payload?: unknown;
};

type RealtimeSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
};

async function openRealtime(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
): Promise<{
  messages: RealtimeMessage[];
  waitFor(type: string, targetId: string, occurrence?: number): Promise<RealtimeMessage>;
  close(): void;
}> {
  const WebSocketConstructor = (
    globalThis as unknown as {
      WebSocket?: new (url: string, protocols?: string[]) => RealtimeSocket;
    }
  ).WebSocket;
  if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");
  const address = app.server.address() as AddressInfo;
  const socket = new WebSocketConstructor(
    `ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`,
    ["otte.v1", `otte.auth.${token}`],
  );
  const messages: RealtimeMessage[] = [];
  const waiters: Array<{
    type: string;
    targetId: string;
    occurrence: number;
    resolve(message: RealtimeMessage): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }> = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      const matches = messages.filter(
        (candidate) => candidate.type === waiter.type && candidate.targetId === waiter.targetId,
      );
      if (matches.length <= waiter.occurrence) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(matches[waiter.occurrence]!);
    }
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening feature regression realtime socket")), 1_000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Feature regression realtime socket failed: ${String(event)}`));
    };
  });

  return {
    messages,
    waitFor(type, targetId, occurrence = 0) {
      const matches = messages.filter(
        (message) => message.type === type && message.targetId === targetId,
      );
      if (matches.length > occurrence) return Promise.resolve(matches[occurrence]!);
      return new Promise<RealtimeMessage>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${type}:${targetId}`)),
          1_000,
        );
        waiters.push({ type, targetId, occurrence, resolve, reject, timer });
      });
    },
    close() {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Realtime socket closed before the expected event"));
      }
      waiters.length = 0;
      socket.close();
    },
  };
}

function seedSession(store: MemoryStateStore, userId: string): { token: string } {
  const token = `ots_feature_regression_${userId}`;
  store.state.sessions.push(
    createTimestamped("sess", {
      id: `sess_feature_regression_${userId}`,
      userId,
      tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
      activeOrganizationId: "org_demo",
      expiresAt: "2099-01-01T00:00:00.000Z",
      lastSeenAt: new Date().toISOString(),
    }) satisfies UserSession,
  );
  return { token };
}

function seedObserver(store: MemoryStateStore): void {
  store.state.users.push(
    createTimestamped("usr", {
      id: "usr_search_observer",
      displayName: "Search Observer",
      email: "search-observer@example.test",
    }) satisfies User,
  );
  store.state.organizationMembers.push(
    createTimestamped("orgmem", {
      id: "orgmem_search_observer",
      organizationId: "org_demo",
      userId: "usr_search_observer",
      role: "member" as const,
    }) satisfies OrganizationMember,
  );
  store.state.members.push(
    createTimestamped("mem", {
      id: "mem_search_observer",
      campaignId: "camp_demo",
      userId: "usr_search_observer",
      role: "observer" as const,
    }) satisfies CampaignMember,
  );
}
