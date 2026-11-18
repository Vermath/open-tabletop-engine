import type { Handout, MapAsset, RealtimePresentation } from "@open-tabletop/core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

it("sends saved content only to selected live seats and limits images to their current presentation", async () => {
  const store = new MemoryStateStore();
  const campaignId = "camp_demo";
  const gm = "usr_demo_gm";
  const player = "usr_demo_player";
  const other = "usr_second_player";
  store.state.users.push({ ...store.state.users.find((u) => u.id === player)!, id: other });
  store.state.members.push({ ...store.state.members.find((m) => m.userId === player)!, id: "mem_second", userId: other });
  store.state.organizationMembers.push({ ...store.state.organizationMembers.find((m) => m.userId === player)!, id: "orgmem_second", userId: other });
  const journal = store.state.journals[0]!;
  const image: MapAsset = { id: "asset_secret", name: "Sealed letter", campaignId, mimeType: "image/png", sizeBytes: 5, storage: { provider: "local", key: "letter.png" },
    url: "/api/v1/assets/asset_secret/blob", createdAt: journal.createdAt, updatedAt: journal.updatedAt };
  const unrelated = { ...image, id: "asset_other", name: "Unrelated secret" };
  store.state.assets.push(image, unrelated);
  const handout: Handout = { ...journal, id: "hnd_letter", title: "Private letter", body: "Bring the sapphire.", assetIds: [image.id] };
  store.state.handouts.push(handout);
  const scene = store.state.scenes[0]!;
  scene.mapPins = [{ id: "pin_gm", label: "Secret pin label", x: 10, y: 10, audience: "gm", targetType: "journal", targetId: journal.id }];
  const path = mkdtempSync(join(tmpdir(), "otte-presentation-"));
  writeFileSync(join(path, "letter.png"), "image");
  const app = await buildApp({ store, uploadDir: path });
  await app.listen({ port: 0, host: "127.0.0.1" });
  async function loginPlayer() {
    const result = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "player@example.test" } });
    expect(result.statusCode).toBe(200);
    return result.json<{ token: string }>().token;
  }
  const playerToken = await loginPlayer();
  const secondSession = await loginPlayer();
  const sockets: WebSocket[] = [];
  async function listen(user: string) {
    const endpoint = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/v1/realtime?campaignId=${campaignId}`;
    const ws = user === player ? new WebSocket(endpoint, ["otte.v1", `otte.auth.${playerToken}`]) : new WebSocket(`${endpoint}&userId=${user}`);
    sockets.push(ws);
    const messages: string[] = [];
    const presentations: RealtimePresentation[] = [];
    ws.onmessage = (event) => {
      messages.push(String(event.data));
      const message = JSON.parse(String(event.data));
      if (message.channel === "presentation") presentations.push(message);
    };
    await expect.poll(() => messages.some((message) => message.includes("presence.snapshot"))).toBe(true);
    return { ws, messages, presentations };
  }
  const present = (user: string, changes = {}) => app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/presentations`, headers: { "x-user-id": user },
    payload: { targetType: "handout", targetId: handout.id, expectedUpdatedAt: handout.updatedAt, recipientUserIds: [player], ...changes } });
  const blob = (user: string, assetId: string, presentationId?: string, token = playerToken) => app.inject({ method: "GET", url: `/api/v1/assets/${assetId}/blob${presentationId ? `?presentationId=${presentationId}` : ""}`, headers: user === player ? { authorization: `Bearer ${token}` } : { "x-user-id": user } });
  try {
    const selected = await listen(player);
    const unselected = await listen(other);
    const before = structuredClone(handout);
    expect((await present(player)).statusCode).toBe(403);
    for (const id of [gm, "unknown"]) expect((await present(gm, { recipientUserIds: [player, id] })).statusCode).toBe(400);
    expect((await present(gm, { expectedUpdatedAt: "2020-01-01T00:00:00.000Z" })).statusCode).toBe(409);
    const send = await present(gm);
    expect(send.json(), send.body).toEqual({ deliveredUserIds: [player] });
    await expect.poll(() => selected.presentations.length).toBe(1);
    const shown = selected.presentations[0]!;
    expect(shown).toMatchObject({ title: handout.title, body: handout.body, images: [{ assetId: image.id, name: image.name }] });
    expect(await blob(player, image.id, shown.id)).toMatchObject({ statusCode: 200, body: "image", headers: { "cache-control": "private, no-store" } });
    expect((await blob(player, image.id, shown.id, secondSession)).statusCode).toBe(404);
    expect((await blob(other, image.id, shown.id)).statusCode).toBe(404);
    expect((await blob(player, unrelated.id, shown.id)).statusCode).toBe(404);
    expect((await blob(player, image.id)).statusCode).toBe(404);
    const clock = vi.spyOn(Date, "now").mockReturnValue(shown.expiresAt + 1);
    try { expect((await blob(player, image.id, shown.id)).statusCode).toBe(404); } finally { clock.mockRestore(); }
    selected.ws.send(JSON.stringify({ type: "presentation.dismiss", id: shown.id }));
    await expect.poll(async () => (await blob(player, image.id, shown.id)).statusCode).toBe(404);
    const pinned = { sceneId: scene.id, pinId: "pin_gm", targetType: "journal", targetId: journal.id, expectedUpdatedAt: journal.updatedAt };
    expect((await present(gm, { ...pinned, pinId: "wrong" })).statusCode).toBe(404);
    expect((await present(gm, pinned)).statusCode).toBe(200);
    await expect.poll(() => selected.presentations.length).toBe(2);
    expect(selected.presentations[1]).toMatchObject({ title: journal.title, body: journal.body, images: [] });
    expect(JSON.stringify(selected.presentations[1])).not.toContain("Secret pin label");
    expect((await present(gm)).statusCode).toBe(200);
    await expect.poll(() => selected.presentations.length).toBe(3);
    const demoted = selected.presentations[2]!;
    const member = store.state.members.find((m) => m.userId === player)!;
    const changeRole = (role: "observer" | "player") => app.inject({ method: "PATCH", url: `/api/v1/campaigns/${campaignId}/members/${member.id}`,
      headers: { "x-user-id": gm, "idempotency-key": crypto.randomUUID() }, payload: { role, expectedUpdatedAt: member.updatedAt } });
    expect((await changeRole("observer")).statusCode).toBe(200);
    await expect.poll(() => selected.messages.map((m) => JSON.parse(m)).some((m) => m.channel === "presentation.revoked" && m.id === demoted.id)).toBe(true);
    expect((await changeRole("player")).statusCode).toBe(200);
    expect((await blob(player, image.id, demoted.id)).statusCode).toBe(404);
    expect((await present(gm)).statusCode).toBe(200);
    await expect.poll(() => selected.presentations.length).toBe(4);
    const latest = selected.presentations[3]!;
    await new Promise<void>((resolve) => { selected.ws.addEventListener("close", () => resolve()); selected.ws.close(); });
    const reconnected = await listen(player);
    expect((await blob(player, image.id, latest.id)).statusCode).toBe(404);
    expect(reconnected.presentations).toEqual([]);
    expect(unselected.presentations).toEqual([]);
    for (const secret of [handout.title, handout.body, image.name, journal.title, journal.body]) expect(unselected.messages.join(" ")).not.toContain(secret);
    await new Promise<void>((resolve) => { reconnected.ws.addEventListener("close", () => resolve()); reconnected.ws.close(); });
    expect((await present(gm)).json()).toEqual({ deliveredUserIds: [] });
    const secondPlayer = store.state.users.find((user) => user.id === other)!;
    secondPlayer.disabledAt = new Date().toISOString();
    expect((await present(gm, { recipientUserIds: [player, other] })).statusCode).toBe(400);
    delete secondPlayer.disabledAt;
    expect(handout).toEqual(before);
    const snapshot = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/snapshot`, headers: { "x-user-id": player } });
    expect(snapshot.body).not.toContain(handout.title);
    expect(snapshot.body).not.toContain(journal.title);
    expect(await app.inject({ method: "GET", url: `/api/v1/handouts/${handout.id}`, headers: { "x-user-id": player } })).toMatchObject({ statusCode: 404 });
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
    rmSync(path, { recursive: true, force: true });
  }
});
