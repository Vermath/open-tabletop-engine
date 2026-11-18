import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PartyRollRequest } from "@open-tabletop/core";
import { expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";
import { SqliteStateStore } from "./sqlite-store.js";

const campaign = "/api/v1/campaigns/camp_demo";
const base = `${campaign}/party-roll-requests`;
const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };
const other = { "x-user-id": "usr_other" };

it("uses the current sheet and records exactly one private result per selected character", async () => {
  const store = new MemoryStateStore();
  const original = store.state.actors.find((actor) => actor.id === "act_valen")!;
  const peer = { ...structuredClone(original), id: "act_peer", ownerUserId: "usr_other", name: "Second character" };
  store.state.actors.push(peer);
  store.state.users.push({ ...store.state.users[1]!, id: "usr_other", email: "second@example.test" });
  store.state.members.push({ ...store.state.members[1]!, id: "mem_other", userId: "usr_other" });
  store.state.organizationMembers.push({ ...store.state.organizationMembers[1]!, id: "orgmem_other", userId: "usr_other" });
  const app = await buildApp({ store });
  const payload = { actorIds: [original.id, peer.id], rollId: "skill-perception" };
  const visibleRequests = async (headers: typeof gm) => {
    const response = await app.inject({ method: "GET", url: `${campaign}/snapshot`, headers });
    expect(response.statusCode, response.body.slice(0, 250)).toBe(200);
    return response.json().partyRollRequests as PartyRollRequest[];
  };
  try {
    expect((await app.inject({ method: "GET", url: `${base}/choices`, headers: player })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: base, headers: { ...player, "idempotency-key": "not-gm" }, payload })).statusCode).toBe(403);
    const create = () => app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "party-check" }, payload });
    const [first, replay] = await Promise.all([create(), create()]);
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toEqual(replay.json());
    expect(store.state.partyRollRequests).toHaveLength(1);
    expect(store.state.idempotencyRecords.some((record) => record.key === "party-check")).toBe(false);
    const reordered = await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "party-check" }, payload: { ...payload, actorIds: [...payload.actorIds].reverse() } });
    expect(reordered.headers["idempotency-replayed"]).toBe("true");
    expect(reordered.json()).toEqual(first.json());
    expect((await visibleRequests(gm))[0]).not.toHaveProperty("creation");
    expect((await visibleRequests(player))[0]).not.toHaveProperty("creation");
    const answer = `${base}/${first.json().id}/actors/${original.id}/roll`;
    expect((await visibleRequests(player))[0]?.recipients.map((row) => row.actorId)).toEqual([original.id]);
    expect((await visibleRequests(other))[0]?.recipients.map((row) => row.actorId)).toEqual([peer.id]);
    expect((await app.inject({ method: "POST", url: answer, headers: other })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: answer, headers: gm })).statusCode).toBe(404);

    original.data.attributes = { ...(original.data.attributes as object), wisdom: 18 };
    original.data.skillProficiencies = ["perception"];
    const expectedFormula = "1d20+6";
    const answerOnce = () => app.inject({ method: "POST", url: answer, headers: player, payload: { formula: "100", total: 100 } });
    const [rolled, duplicate] = await Promise.all([answerOnce(), answerOnce()]);
    expect(rolled.statusCode, rolled.body).toBe(200);
    expect(duplicate.json()).toEqual(rolled.json());
    expect(store.state.rolls.filter((roll) => roll.id === rolled.json().id)).toHaveLength(1);
    const roll = store.state.rolls.find((entry) => entry.id === rolled.json().id)!;
    expect(roll).toMatchObject({ actorId: original.id, userId: original.ownerUserId, formula: expectedFormula });
    expect(roll.total).toBeGreaterThanOrEqual(7);
    expect(roll.total).toBeLessThanOrEqual(26);
    expect((await app.inject({ method: "GET", url: `${campaign}/rolls/${roll.id}/verify`, headers: player })).json()).toMatchObject({ verified: true });
    expect((await app.inject({ method: "GET", url: `${campaign}/rolls/${roll.id}/verify`, headers: other })).statusCode).not.toBe(200);
    expect((await visibleRequests(gm))[0]?.recipients).toEqual([
      expect.objectContaining({ actorId: original.id, result: { id: roll.id, formula: expectedFormula, total: roll.total } }),
      { actorId: peer.id, actorName: peer.name, userId: peer.ownerUserId },
    ]);
    const peerAccount = store.state.users.find((user) => user.id === peer.ownerUserId)!;
    peerAccount.disabledAt = new Date().toISOString();
    expect((await visibleRequests(gm))[0]?.recipients[1]?.unavailable).toBe(true);
    const choices = await app.inject({ method: "GET", url: `${base}/choices`, headers: gm });
    expect(choices.json().map((choice: { actorId: string }) => choice.actorId)).not.toContain(peer.id);
    const disabledRequest = await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "disabled-owner" }, payload });
    expect(disabledRequest.statusCode).toBe(400);
    delete peerAccount.disabledAt;
    peer.ownerUserId = original.ownerUserId!;
    expect(await visibleRequests(other)).toEqual([]);
    expect((await visibleRequests(player))[0]?.recipients).toHaveLength(1);
    expect((await visibleRequests(gm))[0]?.recipients[1]?.unavailable).toBe(true);
    expect((await app.inject({ method: "POST", url: `${base}/${first.json().id}/actors/${peer.id}/roll`, headers: player })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "invalid-check" }, payload: { ...payload, rollId: "death-save" } })).statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

it("restores a pending save and its recorded result across SQLite restarts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "otte-party-roll-"));
  const db = join(directory, "party.sqlite");
  let store = new SqliteStateStore(db);
  let app = await buildApp({ store });
  try {
    const created = await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "party-save" }, payload: { actorIds: ["act_valen"], rollId: "save-strength" } });
    expect(created.statusCode, created.body).toBe(201);
    const url = `${base}/${created.json().id}/actors/act_valen/roll`;
    // Model a completely evicted global retry ledger before restarting the process.
    store.state.idempotencyRecords = [];
    store.save();
    store.flush();
    await app.close();
    store.close();
    store = new SqliteStateStore(db);
    app = await buildApp({ store });
    const retry = await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "party-save" }, payload: { actorIds: ["act_valen"], rollId: "save-strength" } });
    expect(retry.statusCode).toBe(201);
    expect(retry.headers["idempotency-replayed"]).toBe("true");
    expect(retry.json()).toEqual(created.json());
    const changed = await app.inject({ method: "POST", url: base, headers: { ...gm, "idempotency-key": "party-save" }, payload: { actorIds: ["act_valen"], rollId: "save-dexterity" } });
    expect(changed.statusCode).toBe(409);
    expect(store.state.partyRollRequests).toHaveLength(1);
    const response = await app.inject({ method: "POST", url, headers: player });
    expect(response.statusCode, response.body).toBe(200);
    await app.close();
    store.close();
    store = new SqliteStateStore(db);
    app = await buildApp({ store });
    expect((await app.inject({ method: "POST", url, headers: player })).json()).toEqual(response.json());
    expect(store.state.partyRollRequests[0]?.recipients[0]?.result).toMatchObject({ id: response.json().id, formula: "1d20+4" });
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
