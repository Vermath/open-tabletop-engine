import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState, type Campaign, type EngineState } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileStateStore } from "./store.js";

const fsMock = vi.hoisted(() => ({
  failNextRename: undefined as Error | undefined,
  renameCalls: [] as Array<[string, string]>
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: (oldPath: string, newPath: string) => {
      fsMock.renameCalls.push([oldPath, newPath]);
      const error = fsMock.failNextRename;
      fsMock.failNextRename = undefined;
      if (error) throw error;
      actual.renameSync(oldPath, newPath);
    }
  };
});

describe("FileStateStore", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "otte-file-store-"));
    fsMock.failNextRename = undefined;
    fsMock.renameCalls = [];
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("saves state to disk and loads it in a new store instance", () => {
    const filePath = join(directory, "state.json");
    const store = new FileStateStore(filePath, { seedDemo: false });
    store.state = stateWithCampaign("camp_saved", "Saved Campaign");

    store.save();

    const persisted = new FileStateStore(filePath, { seedDemo: false });
    expect(persisted.state.campaigns).toEqual([expect.objectContaining({ id: "camp_saved", name: "Saved Campaign" })]);
    expect(readdirSync(directory).filter((fileName) => fileName.includes(".tmp"))).toEqual([]);
    expect(existsSync(filePath)).toBe(true);
  });

  it("preserves existing state and cleans up the temp file when replacement fails", () => {
    const filePath = join(directory, "state.json");
    writeFileSync(filePath, JSON.stringify(stateWithCampaign("camp_existing", "Existing Campaign"), null, 2));
    const store = new FileStateStore(filePath, { seedDemo: false });
    store.state = stateWithCampaign("camp_replacement", "Replacement Campaign");
    const renameError = new Error("rename failed");
    fsMock.failNextRename = renameError;

    expect(() => store.save()).toThrow(renameError);

    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as EngineState;
    expect(persisted.campaigns).toEqual([expect.objectContaining({ id: "camp_existing" })]);
    expect(fsMock.renameCalls).toHaveLength(1);
    expect(readdirSync(directory).filter((fileName) => fileName.includes(".tmp"))).toEqual([]);
    expect(existsSync(filePath)).toBe(true);
  });
});

function stateWithCampaign(id: string, name: string): EngineState {
  const state = emptyState();
  state.campaigns.push(campaign(id, name));
  return state;
}

function campaign(id: string, name: string): Campaign {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return {
    id,
    organizationId: "org_test",
    ownerUserId: "usr_test",
    name,
    description: "",
    defaultSystemId: "generic-fantasy",
    visibility: "private",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
