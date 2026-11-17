import { createTimestamped, emptyState, type CampaignArchive, type Proposal, type Scene, type SceneMapPin } from "@open-tabletop/core";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { buildApp } from "./app.js";
import { archiveForExportScope, archiveWithRegeneratedIds, mergeArchive } from "./archive-operations.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

it("projects journal pins on the wire and in replayed mutations using current audience and access", async () => {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((record) => record.active)!;
  const path = `/api/v1/scenes/${scene.id}`;
  const journal = store.state.journals[0]!;
  const pin: SceneMapPin = { id: "pin_secret", label: "Hidden vault A3", audience: "readers", x: 123, y: 321, targetType: "journal", targetId: journal.id };
  const app = await buildApp({ store });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const socket = new WebSocket(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/v1/realtime?campaignId=${scene.campaignId}&userId=usr_demo_player`);
  const messages: Array<{ type: string; targetId?: string; payload: unknown }> = [];
  socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
  const edit = (mapPin: unknown, headers = gm, expectedUpdatedAt = scene.updatedAt) => app.inject({
    method: "PATCH", url: path, headers: { ...headers, "idempotency-key": crypto.randomUUID() }, payload: { mapPin, expectedUpdatedAt },
  });
  const share = (visibility: "specific_players" | "gm_only") => app.inject({
    method: "PATCH", url: `/api/v1/journal/${journal.id}`, headers: { ...gm, "idempotency-key": crypto.randomUUID() },
    payload: { visibility, visibleToUserIds: visibility === "specific_players" ? [player["x-user-id"]] : [], expectedUpdatedAt: journal.updatedAt },
  });
  const snapshot = () => app.inject({ method: "GET", url: `/api/v1/campaigns/${scene.campaignId}/snapshot`, headers: player });
  try {
    await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error("Unable to connect player socket")); });
    expect((await edit(pin, player)).statusCode).toBe(403);
    expect((await edit({ ...pin, targetId: "missing" })).statusCode).toBe(400);
    expect((await edit({ ...pin, x: scene.width + 1 })).statusCode).toBe(400);
    const initial = scene.updatedAt;
    const created = await edit(pin);
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json().mapPins).toEqual([pin]);
    expect((await edit({ ...pin, x: 1 }, gm, initial)).statusCode).toBe(409);
    await expect.poll(() => messages.filter((message) => message.type === "scene.updated").length).toBe(1);
    expect(JSON.stringify(messages)).not.toContain(pin.id);
    expect((await snapshot()).body).not.toContain(pin.label);
    expect((await share("specific_players")).statusCode).toBe(200);
    expect((await snapshot()).json().scenes[0].mapPins).toEqual([pin]);

    const replay = { method: "POST" as const, url: path + "/annotations", headers: { ...player, "idempotency-key": "player-public-ping" }, payload: { expectedUpdatedAt: scene.updatedAt, kind: "ping", points: [{ x: 5, y: 10 }] } };
    const ping = await app.inject(replay);
    expect(ping.statusCode, ping.body).toBe(200);
    expect(ping.json().mapPins).toEqual([pin]);
    const moved = { ...pin, x: 212 };
    expect((await edit(moved)).json().mapPins).toEqual([moved]);
    await expect.poll(() => messages.some((message) => message.type === "scene.updated" && (message.payload as Scene).mapPins?.some((item) => item.x === 212))).toBe(true);
    expect((await edit({ ...moved, audience: "gm" })).statusCode).toBe(200);
    expect((await snapshot()).body).not.toContain(pin.id);
    expect((await edit(moved)).statusCode).toBe(200);

    messages.length = 0;
    expect((await share("gm_only")).statusCode).toBe(200);
    await expect.poll(() => messages.find((message) => message.type === "journal.updated")).toMatchObject({ payload: { refreshRequired: true } });
    const revoked = messages.find((message) => message.type === "journal.updated")!;
    expect(revoked.targetId).toBeUndefined();
    expect(JSON.stringify(revoked)).not.toContain(journal.title);
    const replayed = await app.inject(replay);
    expect(replayed.headers["idempotency-replayed"]).toBe("true");
    expect(replayed.json().mapPins).toEqual([]);
    expect((await snapshot()).body).not.toContain(pin.id);
    expect((await app.inject({ method: "GET", url: path, headers: player })).json().mapPins).toEqual([]);
    const removed = await edit({ remove: pin.id });
    expect(removed.json().mapPins).toEqual([]);
  } finally {
    socket.close();
    await app.close();
  }
});

it("restores linked handouts and journals when copying a scoped scene archive", async () => {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((record) => record.active)!;
  const journal = store.state.journals[0]!;
  const handout = { ...journal, id: "hnd_secret", title: "Handout", assetIds: [] };
  store.state.handouts.push(handout);
  const common = { id: "p1", x: 30, y: 85, label: journal.id, audience: "gm" as const };
  scene.mapPins = [{ ...common, targetType: "journal", targetId: journal.id }, { ...common, id: "p2", targetType: "handout", targetId: handout.id, audience: "readers" }];
  const app = await buildApp({ store });
  try {
    store.state.permissionGrants.push(createTimestamped("grant", {
      campaignId: scene.campaignId, subjectType: "user", subjectId: "usr_demo_player", permissions: ["campaign.update", "scene.update"],
    }));
    for (const suffix of ["export", "export?scope=selected_collections&collections=scenes", "export/stream"]) {
      const restricted = await app.inject({ method: "GET", url: `/api/v1/campaigns/${scene.campaignId}/${suffix}`, headers: player });
      expect(restricted.statusCode, restricted.body).toBe(403);
      expect(restricted.body).not.toContain(common.label);
    }
    for (const change of [
      { entity: "journal", action: "delete", id: journal.id, data: {} },
      { entity: "handout", action: "delete", id: handout.id, data: {} },
      { entity: "scene", action: "update", id: scene.id, data: { mapPins: [] } },
    ] satisfies Proposal["changesJson"]) {
      const proposal = createTimestamped("prop", {
        campaignId: scene.campaignId, createdByUserId: "usr_demo_gm", createdByType: "user", title: "Edit scene content",
        summary: "", status: "approved", approvedByUserId: "usr_demo_gm", approvalRequired: true, changesJson: [change], diffJson: {},
      }) satisfies Proposal;
      store.state.proposals.push(proposal);
      const applied = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: { ...gm, "idempotency-key": crypto.randomUUID() }, payload: { expectedUpdatedAt: proposal.updatedAt } });
      expect(applied.statusCode).toBeGreaterThanOrEqual(400);
      expect(store.state.scenes.find((item) => item.id === scene.id)!.mapPins).toHaveLength(2);
    }
    const exported = await app.inject({ method: "GET", url: `/api/v1/campaigns/${scene.campaignId}/export`, headers: gm });
    expect(exported.statusCode).toBe(200);
    const projected = archiveForExportScope(exported.json<CampaignArchive>(), { scope: "selected_collections", collections: ["scenes"], version: "0.2.0", redaction: "portable" });
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const copy = archiveWithRegeneratedIds(projected.archive, { userId: "usr_demo_gm", organizationId: "org_demo" });
    expect(validateCampaignArchiveShape(copy, { maxAssetBytes: 1024 * 1024 }).ok).toBe(true);
    const restored = emptyState();
    mergeArchive(restored, copy);
    const pins = restored.scenes.find((record) => record.mapPins?.length)!.mapPins!;
    expect(pins).toEqual([
      { ...scene.mapPins[0], targetId: restored.journals.find((entry) => entry.title === journal.title)!.id },
      { ...scene.mapPins[1], targetId: restored.handouts.find((entry) => entry.title === handout.title)!.id },
    ]);
    expect(pins[0]!.targetId).not.toBe(journal.id);
    expect(pins[1]!.targetId).not.toBe(handout.id);
    const invalid = structuredClone(copy);
    invalid.data.scenes.find((record) => record.mapPins?.length)!.mapPins![0]!.audience = "public" as "gm";
    expect(validateCampaignArchiveShape(invalid, { maxAssetBytes: 1024 * 1024 }).ok).toBe(false);
  } finally { await app.close(); }
});
