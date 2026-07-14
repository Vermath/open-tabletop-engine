import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminScimGroupRoleMapping,
  deleteAdminScimGroupRoleMapping,
  type AdminScimGroupRoleMapping,
  type AdminScimGroupRoleMappingInput,
} from "./api.js";

const targetSetHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const input = {
  campaignId: "camp/one",
  role: "player",
  groupExternalId: "group/external",
} satisfies AdminScimGroupRoleMappingInput;

describe("admin SCIM mapping client", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => {
        if (key === "otte:sessionToken") return "ots_scim-test";
        if (key === "otte:sessionTokenUser" || key === "otte:userId") return "usr_admin";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("previews once and preserves the exact prepared body across an ambiguous retry", async () => {
    let postAttempts = 0;
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postAttempts += 1;
        if (postAttempts === 1) throw new Error("connection closed after commit");
        return jsonResponse({ mapping: { id: "mapping_1" }, sync: {} });
      }
      return jsonResponse({ selection: input, memberCount: 1, affectedCampaignMembershipCount: 0, targetSetHash });
    });
    vi.stubGlobal("fetch", fetchMock);

    const options = { idempotencyKey: "scim-map-attempt-1" };
    await expect(createAdminScimGroupRoleMapping(input, options)).rejects.toThrow("connection closed after commit");
    await createAdminScimGroupRoleMapping(input, options);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/group-role-mappings/preview?");
    for (const call of fetchMock.mock.calls.slice(1)) {
      const [, init] = call;
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(options.idempotencyKey);
      expect(JSON.parse(String(init?.body))).toEqual({ ...input, preparedTargetSetHash: targetSetHash });
    }
  });

  it("deletes by encoded id with both the exact mapping revision and prepared target hash", async () => {
    const fetchMock = vi.fn(async (_request: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ removedMemberships: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const mapping = {
      id: "mapping/one",
      campaignId: input.campaignId,
      role: input.role,
      groupExternalId: input.groupExternalId,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:01:00.000Z",
      targetSetHash,
    } satisfies AdminScimGroupRoleMapping;

    await deleteAdminScimGroupRoleMapping(mapping, { idempotencyKey: "scim-map-delete-1" });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/admin/scim/group-role-mappings/mapping%2Fone");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("scim-map-delete-1");
    expect(JSON.parse(String(init?.body))).toEqual({ expectedUpdatedAt: mapping.updatedAt, preparedTargetSetHash: targetSetHash });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
