import { describe, expect, it } from "vitest";
import { inspectLocalDraft, localDraftKey, readLocalDraft, removeLocalDraft, writeLocalDraft } from "./local-draft-storage.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("local draft storage", () => {
  it("scopes draft keys and round-trips versioned values", () => {
    const storage = memoryStorage();
    const key = localDraftKey("character", "campaign/one", "user:one");
    expect(key).toBe("otte:draft:character:v1:campaign%2Fone:user%3Aone");
    writeLocalDraft(key, { name: "Ember" }, storage);
    expect(readLocalDraft<{ name: string }>(key, storage)).toEqual({ name: "Ember" });
    removeLocalDraft(key, storage);
    expect(readLocalDraft(key, storage)).toBeUndefined();
  });

  it("preserves corrupt records for an explicit recovery or discard decision", () => {
    const storage = memoryStorage();
    storage.setItem("bad", "{not json");
    expect(readLocalDraft("bad", storage)).toBeUndefined();
    expect(inspectLocalDraft("bad", storage)).toEqual({ status: "corrupt", rawValue: "{not json" });
    expect(storage.getItem("bad")).toBe("{not json");
  });

  it("preserves unsupported envelope versions and reports unavailable writes", () => {
    const storage = memoryStorage();
    const rawValue = JSON.stringify({ version: 0, value: { name: "Old" } });
    storage.setItem("old", rawValue);
    expect(readLocalDraft("old", storage)).toBeUndefined();
    expect(inspectLocalDraft("old", storage)).toEqual({ status: "unsupported", rawValue, version: 0 });
    expect(storage.getItem("old")).toBe(rawValue);
    expect(writeLocalDraft("missing", { name: "No storage" }, undefined)).toBe(false);
  });
});
