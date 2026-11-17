import type { WorldRecord, WorldRelation } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./api.js", () => ({ apiPost: api.post, apiPatch: api.patch, apiDelete: api.delete }));

import {
  WorldGraphPanel,
  changeWorldRecordLifecycle,
  createWorldRecord,
  createWorldRelation,
  deleteWorldRecord,
  deleteWorldRelation,
  readableWorldGraph,
  updateWorldRecord,
  updateWorldRelation,
} from "./world-graph-panel.js";

const revision = "2026-07-13T00:00:00.000Z";

function record(id: string, visibility: WorldRecord["visibility"]): WorldRecord {
  return {
    id,
    campaignId: "camp",
    kind: "npc",
    name: id,
    summary: "",
    description: "",
    lifecycle: "active",
    visibility,
    tags: [],
    metadata: {},
    createdByUserId: "gm",
    updatedByUserId: "gm",
    createdAt: revision,
    updatedAt: revision,
  };
}

function relation(id: string, sourceRecordId: string, targetRecordId: string, visibility: WorldRelation["visibility"]): WorldRelation {
  return {
    id,
    campaignId: "camp",
    sourceRecordId,
    targetRecordId,
    type: "related_to",
    visibility,
    createdByUserId: "gm",
    updatedByUserId: "gm",
    createdAt: revision,
    updatedAt: revision,
  };
}

describe("WorldGraphPanel", () => {
  beforeEach(() => {
    api.post.mockReset().mockResolvedValue({});
    api.patch.mockReset().mockResolvedValue({});
    api.delete.mockReset().mockResolvedValue({});
  });

  it("filters GM-only records and relations from a reader surface", () => {
    const records = [record("Public NPC", "public"), record("GM Secret", "gm_only"), record("Public Place", "public")];
    const relations = [
      relation("public-safe", "Public NPC", "Public Place", "public"),
      relation("public-leak", "Public NPC", "GM Secret", "public"),
      relation("gm-edge", "Public NPC", "Public Place", "gm_only"),
    ];
    expect(readableWorldGraph(records, relations, false)).toEqual({ records: [records[0], records[2]], relations: [relations[0]] });
    const html = renderToStaticMarkup(
      <WorldGraphPanel
        campaignId="camp"
        campaignUpdatedAt={revision}
        selectedWorldId="all"
        records={records}
        relations={relations}
        canCreate={false}
        canUpdate={false}
        canDelete={false}
        onRecordsChange={vi.fn()}
        onRelationsChange={vi.fn()}
        onRefreshSharedState={vi.fn(async () => undefined)}
        onStatus={vi.fn()}
      />,
    );
    expect(html).toContain("Public NPC");
    expect(html).toContain("Public Place");
    expect(html).not.toContain("GM Secret");
    expect(html).not.toContain("Add graph record");
    expect(html).not.toContain("Connect records");
  });

  it("sends exact revisions and stable replay keys for every graph mutation", async () => {
    const createInput = { kind: "npc" as const, name: "Mira", summary: "Guide", description: "", visibility: "gm_only" as const, tags: [], expectedCampaignUpdatedAt: revision };
    await createWorldRecord("camp", createInput);
    await createWorldRecord("camp", createInput);
    const firstCreateOptions = api.post.mock.calls[0]?.[2];
    expect(firstCreateOptions.idempotencyKey).toBeTruthy();
    expect(api.post.mock.calls[1]?.[2]?.idempotencyKey).toBe(firstCreateOptions.idempotencyKey);
    expect(api.post.mock.calls[0]?.[1]).toMatchObject({ expectedCampaignUpdatedAt: revision });

    await updateWorldRecord("record", { name: "Mira II", expectedUpdatedAt: revision });
    await changeWorldRecordLifecycle("record", "resolved", revision);
    await deleteWorldRecord("record", revision);
    expect(api.patch.mock.calls[0]?.[1]).toEqual({ name: "Mira II", expectedUpdatedAt: revision });
    expect(api.patch.mock.calls[0]?.[2]?.idempotencyKey).toBeTruthy();
    expect(api.post.mock.calls[2]?.[1]).toEqual({ lifecycle: "resolved", expectedUpdatedAt: revision });
    expect(api.post.mock.calls[2]?.[2]?.idempotencyKey).toBeTruthy();
    expect(api.delete.mock.calls[0]?.[0]).toContain(`expectedUpdatedAt=${encodeURIComponent(revision)}`);
    expect(api.delete.mock.calls[0]?.[1]?.idempotencyKey).toBeTruthy();

    const relationInput = { sourceRecordId: "a", targetRecordId: "b", type: "allied_with" as const, visibility: "public" as const, expectedCampaignUpdatedAt: revision };
    await createWorldRelation("camp", relationInput);
    await updateWorldRelation("relation", { label: "Allies", expectedUpdatedAt: revision });
    await deleteWorldRelation("relation", revision);
    expect(api.post.mock.calls[3]?.[1]).toMatchObject({ expectedCampaignUpdatedAt: revision });
    expect(api.post.mock.calls[3]?.[2]?.idempotencyKey).toBeTruthy();
    expect(api.patch.mock.calls[1]?.[1]).toEqual({ label: "Allies", expectedUpdatedAt: revision });
    expect(api.patch.mock.calls[1]?.[2]?.idempotencyKey).toBeTruthy();
    expect(api.delete.mock.calls[1]?.[0]).toContain(`expectedUpdatedAt=${encodeURIComponent(revision)}`);
    expect(api.delete.mock.calls[1]?.[1]?.idempotencyKey).toBeTruthy();
  });

  it("refreshes stale resources without clearing record or relation drafts and reports ordinary errors", () => {
    const source = readFileSync(resolve(__dirname, "world-graph-panel.tsx"), "utf8");
    expect(source).toContain("if (isStaleWriteError(error))");
    expect(source).toContain("await props.onRefreshSharedState();");
    expect(source).toContain("staleDraftPreservedMessage");
    expect(source).toContain("errorMessage(error)");
    expect(source).not.toContain('setEditName("")');
    expect(source).not.toContain('setEditRelationLabel("")');
  });
});
