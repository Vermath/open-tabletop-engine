import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyState } from "@open-tabletop/core";
import { buildApp } from "./app.js";
import { FileStateStore, MemoryStateStore } from "./store.js";

const token = "scim-integration-token";
const authorization = `Bearer ${token}`;

describe("durable SCIM idempotency", () => {
  const previousToken = process.env.OTTE_SCIM_BEARER_TOKEN;

  beforeEach(() => {
    process.env.OTTE_SCIM_BEARER_TOKEN = token;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.OTTE_SCIM_BEARER_TOKEN;
    else process.env.OTTE_SCIM_BEARER_TOKEN = previousToken;
  });

  it("replays a persisted user creation after a full app and file-store restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-scim-replay-"));
    const statePath = join(directory, "state.json");
    const request = {
      method: "POST" as const,
      url: "/api/v1/scim/v2/Users",
      headers: { authorization, "idempotency-key": "restart-user-create" },
      payload: { userName: "restart@example.test", displayName: "Restart User", active: true },
    };
    let firstStore: FileStateStore | undefined;
    let secondStore: FileStateStore | undefined;
    try {
      firstStore = new FileStateStore(statePath, { seedDemo: false });
      const firstApp = await buildApp({ store: firstStore });
      const first = await firstApp.inject(request);
      expect(first.statusCode).toBe(201);
      expect(first.headers.etag).toMatch(/^"scim-sha256-[a-f0-9]{64}"$/);
      expect(firstStore.state.users).toHaveLength(1);
      expect(firstStore.state.idempotencyRecords).toHaveLength(1);
      expect(firstStore.state.idempotencyRecords[0]?.userId).toMatch(/^scim:[a-f0-9]{64}$/);
      await firstApp.close();
      firstStore.close();
      firstStore = undefined;

      secondStore = new FileStateStore(statePath, { seedDemo: false });
      const secondApp = await buildApp({ store: secondStore });
      const replay = await secondApp.inject(request);
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.headers.etag).toBe(first.headers.etag);
      expect(replay.headers.location).toBe(first.headers.location);
      expect(replay.json()).toEqual(first.json());
      expect(secondStore.state.users).toHaveLength(1);
      await secondApp.close();
      secondStore.close();
      secondStore = undefined;
    } finally {
      firstStore?.close();
      secondStore?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("replays exact group mutations, binds replay to If-Match, and never mutates on stale validators", async () => {
    const store = new MemoryStateStore(emptyState());
    const app = await buildApp({ store });
    const createRequest = {
      method: "POST" as const,
      url: "/api/v1/scim/v2/Groups",
      headers: { authorization, "idempotency-key": "group-create" },
      payload: { displayName: "Operators", members: [] },
    };
    const created = await app.inject(createRequest);
    const createReplay = await app.inject(createRequest);
    expect(created.statusCode).toBe(201);
    expect(createReplay.statusCode).toBe(201);
    expect(createReplay.headers["idempotency-replayed"]).toBe("true");
    expect(createReplay.headers.etag).toBe(created.headers.etag);
    expect(createReplay.headers.location).toBe(created.headers.location);
    expect(store.state.scimGroups).toHaveLength(1);

    const groupId = created.json().id as string;
    const originalEtag = created.headers.etag!;
    const patchRequest = {
      method: "PATCH" as const,
      url: `/api/v1/scim/v2/Groups/${groupId}`,
      headers: { authorization, "idempotency-key": "group-patch", "if-match": originalEtag },
      payload: { Operations: [{ op: "replace", path: "displayName", value: "Operators Updated" }] },
    };
    const patched = await app.inject(patchRequest);
    const patchReplay = await app.inject(patchRequest);
    expect(patched.statusCode).toBe(200);
    expect(patchReplay.statusCode).toBe(200);
    expect(patchReplay.headers["idempotency-replayed"]).toBe("true");
    expect(patchReplay.headers.etag).toBe(patched.headers.etag);
    expect(store.state.scimGroups[0]?.displayName).toBe("Operators Updated");

    const changedValidatorSameKey = await app.inject({ ...patchRequest, headers: { ...patchRequest.headers, "if-match": patched.headers.etag! } });
    expect(changedValidatorSameKey.statusCode).toBe(409);
    const staleNewKey = await app.inject({ ...patchRequest, headers: { ...patchRequest.headers, "idempotency-key": "group-patch-stale" } });
    expect(staleNewKey.statusCode).toBe(412);
    expect(store.state.scimGroups[0]?.displayName).toBe("Operators Updated");

    const deleteRequest = {
      method: "DELETE" as const,
      url: `/api/v1/scim/v2/Groups/${groupId}`,
      headers: { authorization, "idempotency-key": "group-delete", "if-match": patched.headers.etag! },
    };
    const removed = await app.inject(deleteRequest);
    const removeReplay = await app.inject(deleteRequest);
    expect(removed.statusCode).toBe(204);
    expect(removeReplay.statusCode).toBe(204);
    expect(removeReplay.headers["idempotency-replayed"]).toBe("true");
    expect(store.state.scimGroups).toHaveLength(0);
    await app.close();
  });
});
