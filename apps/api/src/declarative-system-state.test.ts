import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyState,
  type Actor,
  type Campaign,
  type DeclarativeSystemManifest,
  type EngineState,
  type Item,
  type SystemInstallation,
  type SystemManifestIdentity,
} from "@open-tabletop/core";
import * as systemSdk from "@open-tabletop/system-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertDeclarativeSystemState,
  assertDeclarativeSystemStateCandidate,
  assertDeclarativeSystemStateCommit,
  DeclarativeSystemStateError,
  resolvePinnedDeclarativeSystem,
  type DeclarativeStateRecordChange,
  type DeclarativeSystemState,
} from "./declarative-system-state.js";
import {
  createDeclarativeSystemRuntime,
  declarativeSystemManifestChecksum,
} from "./declarative-system-runtime.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { FileStateStore, MemoryStateStore, type StateStore } from "./store.js";

const timestamp = "2026-09-06T12:00:00.000Z";
const storeKinds = ["memory", "file", "sqlite"] as const;
type StoreKind = (typeof storeKinds)[number];
type TestStore = MemoryStateStore | FileStateStore | SqliteStateStore;
const stores = new Set<TestStore>();
const directories: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores) {
    (store as StateStore).restoreDurableState?.();
    if ("close" in store) store.close();
  }
  stores.clear();
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("declarative system state validation", () => {
  it("resolves an exact pin and validates actor and item data without changing state", () => {
    const state = fixtureState();
    const before = structuredClone(state);
    expect(resolvePinnedDeclarativeSystem(state, "camp_lantern", "lantern-survey")).toEqual({
      manifest: state.systemInstallations[0]!.manifest,
      identity: state.campaigns[0]!.systemBindings![0],
    });
    expect(() => assertDeclarativeSystemState(state)).not.toThrow();
    expect(state).toEqual(before);
  });

  it.each(identityFailures())("rejects $name", ({ edit }) => {
    const state = fixtureState();
    edit(state);
    validationFailure(() => assertDeclarativeSystemState(state));
  });

  it.each(recordFailures())("rejects $name against the pinned schema and declared type", ({ edit, collection, recordId }) => {
    const state = fixtureState(nestedManifest());
    edit(state);
    const error = validationFailure(() => assertDeclarativeSystemState(state));
    expect(error.issues).toContainEqual(expect.objectContaining({ collection, recordId }));
  });

  it("keeps an accepted system version immutable even when its definition and both checksums change together", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    const definition = candidate.systemInstallations[0]!.manifest as DeclarativeSystemManifest;
    definition.name = "Replaced content under the same version";
    const checksum = declarativeSystemManifestChecksum(definition);
    candidate.systemInstallations[0]!.checksum = checksum;
    candidate.campaigns[0]!.systemBindings![0]!.checksum = checksum;
    expect(() => assertDeclarativeSystemState(candidate)).not.toThrow();
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    validationFailure(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate)));
  });

  it("does not allow same-version replacement by changing the installation record ID", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    const definition = lanternManifest();
    definition.name = "Replacement installation";
    candidate.systemInstallations = [installation(definition, "replacement_installation")];
    candidate.campaigns[0]!.systemBindings = [identity(definition)];
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
  });

  it("rejects a conflicting duplicate of an accepted version even when all records are pinned elsewhere", () => {
    const previous = stateWithUnboundVersion();
    const before = structuredClone(previous);
    const candidate = structuredClone(previous);
    candidate.systemInstallations.push(conflictingUnboundInstallation());
    validationFailure(() => assertDeclarativeSystemState(candidate));
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    validationFailure(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate)));
    expect(previous).toEqual(before);
  });

  it("retains prior executable classification when both the definition and its binding are removed", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    candidate.systemInstallations = [];
    candidate.campaigns[0]!.systemBindings = [];
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    validationFailure(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate)));
  });

  it("checks final proposed bindings and leaves the original untouched when a late record is invalid", () => {
    const previous = fixtureState();
    previous.actors.push(actor("actor_late", "camp_lantern", lanternManifest()));
    const before = structuredClone(previous);
    const candidate = structuredClone(previous);
    const next = lanternManifest("2.0.0");
    next.schemas.actor.properties.wits = { type: "integer", minimum: 0, maximum: 3 };
    candidate.systemInstallations.push(installation(next));
    candidate.campaigns[0]!.systemBindings = [identity(next)];
    candidate.actors[0]!.data.wits = 3;
    candidate.actors[1]!.data.wits = 4;
    const error = validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    expect(error.issues).toContainEqual(expect.objectContaining({ collection: "actors", recordId: "actor_late" }));
    expect(previous).toEqual(before);
    candidate.actors[1]!.data.wits = 1;
    expect(() => assertDeclarativeSystemStateCandidate(previous, candidate)).not.toThrow();
  });

  it("verifies historical checksums independently of current-host execution compatibility", () => {
    const definition = lanternManifest();
    definition.compatibleCore = ">=0.1.0 <0.2.0";
    const state = fixtureState(definition);
    expect(() => assertDeclarativeSystemState(state)).not.toThrow();
    expect(resolvePinnedDeclarativeSystem(state, "camp_lantern", definition.id).identity).toEqual(identity(definition));
    expect(() => createDeclarativeSystemRuntime(definition, { campaignId: "camp_lantern", ...identity(definition) }, { coreVersion: "0.3.0" })).toThrow();
  });

  it("preserves metadata-only and unmarked historical records without adding actor/item relationships", () => {
    const state = fixtureState();
    state.systemInstallations = [{
      ...state.systemInstallations[0]!,
      checksum: undefined,
      manifest: {
        id: "legacy-metadata",
        name: "Historical metadata",
        version: "1.0.0",
        compatibleCore: "*",
        entrypoints: {},
        schemas: { actor: "legacy.actor.json", item: "legacy.item.json" },
        permissions: [],
        capabilities: [],
      },
    }];
    state.campaigns[0]!.systemBindings = undefined;
    state.actors[0]!.systemId = "legacy-metadata";
    state.actors[0]!.type = "legacy-type";
    state.actors[0]!.data = { arbitrary: ["historical", "data"] };
    state.items[0]!.systemId = "absent-historical-system";
    state.items[0]!.actorId = "actor_from_another_campaign";
    state.items[0]!.data = { arbitrary: true };
    expect(() => assertDeclarativeSystemState(state)).not.toThrow();
    validationFailure(() => resolvePinnedDeclarativeSystem(state, "camp_lantern", "legacy-metadata"));
  });

  it.each(malformedDefinitionMarkers())("rejects an own $name executable marker on otherwise metadata-only initial and candidate state", ({ value }) => {
    const previous = legacyMetadataState();
    const candidate = structuredClone(previous);
    (candidate.systemInstallations[0]!.manifest as unknown as { definition: unknown }).definition = value;
    validationFailure(() => assertDeclarativeSystemState(candidate));
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    expect(Object.hasOwn(candidate.systemInstallations[0]!.manifest, "definition")).toBe(true);
    expect(Object.hasOwn(previous.systemInstallations[0]!.manifest, "definition")).toBe(false);
  });

  it("rejects null bindings even when a metadata-only campaign has no declarative records", () => {
    const previous = legacyMetadataState();
    previous.campaigns.push({ ...campaign("camp_legacy", lanternManifest()), defaultSystemId: "legacy-metadata", systemBindings: undefined });
    const candidate = structuredClone(previous);
    (candidate.campaigns[0] as unknown as { systemBindings: unknown }).systemBindings = null;
    validationFailure(() => assertDeclarativeSystemState(candidate));
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    expect(previous.campaigns[0]!.systemBindings).toBeUndefined();
  });

  it("bounds structured issues for a large invalid batch", () => {
    const state = fixtureState();
    state.actors = Array.from({ length: 100 }, (_, index) => ({ ...actor(`actor_${index}`, "camp_lantern", lanternManifest()), data: {} }));
    const error = validationFailure(() => assertDeclarativeSystemState(state));
    expect(error.issues.length).toBeLessThanOrEqual(32);
    expect(error.issues.every((issue) => typeof issue.recordId === "string" && Array.isArray(issue.path))).toBe(true);
  });
});

describe("empty campaign declarative defaults", () => {
  it("rejects an executable default without an exact binding during initial validation", () => {
    const state = emptyCampaignState();
    state.campaigns[0]!.systemBindings = undefined;
    validationFailure(() => assertDeclarativeSystemState(state));
    state.campaigns[0]!.systemBindings = [{ ...identity(lanternManifest()), checksum: "0".repeat(64) }];
    validationFailure(() => assertDeclarativeSystemState(state));
  });

  it.each(defaultTransitions())("rejects $name using final candidate state and prior executable markers", ({ previous: createPrevious, edit, invalidInitial }) => {
    const previous = createPrevious();
    const accepted = structuredClone(previous);
    const candidate = structuredClone(previous);
    edit(candidate);
    expect(() => assertDeclarativeSystemState(previous)).not.toThrow();
    if (invalidInitial) validationFailure(() => assertDeclarativeSystemState(candidate));
    validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    validationFailure(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate)));
    expect(previous).toEqual(accepted);
  });

  it.each(["generic-fantasy", "historical-unknown"])("accepts removing an unused executable definition while the final default changes to %s", (systemId) => {
    const previous = emptyCampaignState();
    const candidate = structuredClone(previous);
    candidate.systemInstallations = [];
    candidate.campaigns[0]!.systemBindings = undefined;
    candidate.campaigns[0]!.defaultSystemId = systemId;
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    expect(() => assertDeclarativeSystemState(candidate)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCandidate(previous, candidate)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate))).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
  });

  it("accepts installing the first definition and its exact final default binding together", () => {
    const previous = legacyDefaultState("lantern-survey");
    const candidate = structuredClone(previous);
    candidate.systemInstallations.push(installation(lanternManifest()));
    candidate.campaigns[0]!.systemBindings = [identity(lanternManifest())];
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    expect(() => assertDeclarativeSystemState(candidate)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCandidate(previous, candidate)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate))).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
  });

  it.each(["historical-unknown", "legacy-metadata"])("preserves unmarked %s defaults without bindings", (systemId) => {
    const previous = legacyDefaultState(systemId);
    if (systemId === "legacy-metadata") previous.systemInstallations = legacyMetadataState().systemInstallations;
    const candidate = structuredClone(previous);
    candidate.campaigns[0]!.name = "Updated historical campaign";
    expect(() => assertDeclarativeSystemState(previous)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCandidate(previous, candidate)).not.toThrow();
    expect(() => assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate))).not.toThrow();
  });
});

describe("declarative validation work bounds", () => {
  it("does no actor/item validation for an empty commit or campaign cursor-only change", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    candidate.campaigns[0]!.eventSequence = 7;
    candidate.campaigns[0]!.updatedAt = "2026-09-06T12:01:00.000Z";
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCommit(candidate, []);
    assertDeclarativeSystemStateCandidate(previous, candidate);
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).not.toHaveBeenCalled();
  });

  it("does no actor/item validation when only the default changes to a system with an already valid pin", () => {
    const previous = fixtureState();
    previous.campaigns[0]!.defaultSystemId = "historical-unknown";
    const candidate = structuredClone(previous);
    candidate.campaigns[0]!.defaultSystemId = "lantern-survey";
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCandidate(previous, candidate);
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).not.toHaveBeenCalled();
  });

  it("validates one complete changed actor even when only its metadata changes", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    candidate.actors[0]!.name = "Renamed surveyor";
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCandidate(previous, candidate);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]![1]).toEqual(candidate.actors[0]!.data);
  });

  it("validates one changed item independently and validates no deleted record", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    candidate.items[0]!.name = "Renamed gear";
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]![1]).toEqual(candidate.items[0]!.data);
    validate.mockClear();
    candidate.items = [];
    candidate.actors = [];
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).not.toHaveBeenCalled();
  });

  it("validates a new unrelated version without rechecking records pinned to the existing version", () => {
    const previous = fixtureState();
    const candidate = structuredClone(previous);
    candidate.systemInstallations.push(installation(lanternManifest("2.0.0")));
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCandidate(previous, candidate);
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).not.toHaveBeenCalled();
  });

  it("fans a pin switch out only to that campaign and system's actors and items", () => {
    const previous = fixtureState();
    const definition = lanternManifest();
    previous.actors.push({ ...actor("actor_second", "camp_lantern", definition), data: { wits: 1, grit: 1, stamina: 6 } });
    previous.campaigns.push(campaign("camp_other", definition));
    previous.actors.push({ ...actor("actor_other_campaign", "camp_other", definition), data: { wits: 4, grit: 4, stamina: 6 } });
    previous.items.push({ ...item("item_other_campaign", "camp_other", definition), data: { weight: 10, quality: "refined" } });
    const otherSystem = lanternManifest();
    otherSystem.id = "other-lantern";
    previous.systemInstallations.push(installation(otherSystem));
    previous.campaigns[0]!.systemBindings!.push(identity(otherSystem));
    previous.actors.push({ ...actor("actor_other_system", "camp_lantern", otherSystem), data: { wits: 3, grit: 3, stamina: 6 } });
    const candidate = structuredClone(previous);
    const next = lanternManifest("2.0.0");
    candidate.systemInstallations.push(installation(next));
    candidate.campaigns[0]!.systemBindings![0] = identity(next);
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCommit(candidate, changesBetween(previous, candidate));
    expect(validate).toHaveBeenCalledTimes(3);
    expect(validate.mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining([
      candidate.actors[0]!.data, candidate.actors[1]!.data, candidate.items[0]!.data,
    ]));
  });
});

describe.each(storeKinds)("%s declarative state commits", (kind) => {
  it("rejects invalid initial state before returning a usable store", () => {
    const invalid = fixtureState();
    invalid.actors[0]!.data.stamina = -1;
    if (kind === "memory") {
      validationFailure(() => new MemoryStateStore(invalid));
    } else if (kind === "file") {
      const path = join(tempDirectory(), "invalid.json");
      const bytes = JSON.stringify(invalid);
      writeFileSync(path, bytes);
      validationFailure(() => new FileStateStore(path, { seedDemo: false }));
      expect(readFileSync(path, "utf8")).toBe(bytes);
    } else {
      const path = join(tempDirectory(), "invalid.sqlite");
      const seeded = track(new SqliteStateStore(path, { seedDemo: false }));
      seeded.replace(fixtureState());
      seeded.db.prepare("update engine_records set data = ? where collection = 'actors' and id = ?").run(JSON.stringify(invalid.actors[0]), invalid.actors[0]!.id);
      closeTracked(seeded);
      validationFailure(() => new SqliteStateStore(path, { seedDemo: false }));
    }
  });

  it("rejects an initial empty campaign whose executable default has no binding", () => {
    const invalid = emptyCampaignState();
    invalid.campaigns[0]!.systemBindings = undefined;
    if (kind === "memory") {
      validationFailure(() => new MemoryStateStore(invalid));
    } else if (kind === "file") {
      const path = join(tempDirectory(), "unbound-default.json");
      const bytes = JSON.stringify(invalid);
      writeFileSync(path, bytes);
      validationFailure(() => new FileStateStore(path, { seedDemo: false }));
      expect(readFileSync(path, "utf8")).toBe(bytes);
    } else {
      const path = join(tempDirectory(), "unbound-default.sqlite");
      const seeded = track(new SqliteStateStore(path, { seedDemo: false }));
      seeded.replace(emptyCampaignState());
      seeded.db.prepare("update engine_records set data = ? where collection = 'campaigns' and id = ?").run(JSON.stringify(invalid.campaigns[0]), invalid.campaigns[0]!.id);
      closeTracked(seeded);
      validationFailure(() => new SqliteStateStore(path, { seedDemo: false }));
    }
  });

  it.each(defaultTransitions())("rolls back $name on an empty campaign", ({ previous: createPrevious, edit }) => {
    const harness = createHarness(kind, createPrevious());
    const accepted = structuredClone(harness.store.state);
    edit(harness.store.state);
    expect(() => harness.store.save()).not.toThrow();
    validationFailure(() => harness.store.flush());
    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
  });

  it.each(["generic-fantasy", "historical-unknown"])("accepts clearing the executable definition and binding while switching the final default to %s", (systemId) => {
    const harness = createHarness(kind, emptyCampaignState());
    harness.store.state.systemInstallations = [];
    harness.store.state.campaigns[0]!.systemBindings = undefined;
    harness.store.state.campaigns[0]!.defaultSystemId = systemId;
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    harness.store.save();
    expect(() => harness.store.flush()).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it("accepts a first executable definition with its exact final default binding", () => {
    const harness = createHarness(kind, legacyDefaultState("lantern-survey"));
    harness.store.state.systemInstallations.push(installation(lanternManifest()));
    harness.store.state.campaigns[0]!.systemBindings = [identity(lanternManifest())];
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    harness.store.save();
    expect(() => harness.store.flush()).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it("keeps a default-only change with a valid pin free of actor/item schema work", () => {
    const state = fixtureState();
    state.campaigns[0]!.defaultSystemId = "historical-unknown";
    const harness = createHarness(kind, state);
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    harness.store.state.campaigns[0]!.defaultSystemId = "lantern-survey";
    harness.store.save();
    expect(() => harness.store.flush()).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it.each(["historical-unknown", "legacy-metadata"])("keeps unmarked %s defaults without bindings valid", (systemId) => {
    const state = legacyDefaultState(systemId);
    if (systemId === "legacy-metadata") state.systemInstallations = legacyMetadataState().systemInstallations;
    const harness = createHarness(kind, state);
    harness.store.state.campaigns[0]!.name = "Saved historical campaign";
    harness.store.save();
    expect(() => harness.store.flush()).not.toThrow();
    expect(harness.store.state.campaigns[0]!.systemBindings).toBeUndefined();
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it("rejects an initially duplicated unbound executable version", () => {
    const invalid = stateWithUnboundVersion();
    const conflicting = conflictingUnboundInstallation();
    invalid.systemInstallations.push(conflicting);
    if (kind === "memory") {
      validationFailure(() => new MemoryStateStore(invalid));
    } else if (kind === "file") {
      const path = join(tempDirectory(), "duplicate-version.json");
      const bytes = JSON.stringify(invalid);
      writeFileSync(path, bytes);
      validationFailure(() => new FileStateStore(path, { seedDemo: false }));
      expect(readFileSync(path, "utf8")).toBe(bytes);
    } else {
      const path = join(tempDirectory(), "duplicate-version.sqlite");
      const seeded = track(new SqliteStateStore(path, { seedDemo: false }));
      seeded.replace(stateWithUnboundVersion());
      seeded.db.prepare("insert into engine_records (collection, id, campaign_id, created_at, updated_at, data) values ('systemInstallations', ?, null, ?, ?, ?)").run(conflicting.id, timestamp, timestamp, JSON.stringify(conflicting));
      closeTracked(seeded);
      validationFailure(() => new SqliteStateStore(path, { seedDemo: false }));
    }
  });

  it("discards insertion of conflicting content under an already accepted unbound version", () => {
    const harness = createHarness(kind, stateWithUnboundVersion());
    const accepted = structuredClone(harness.store.state);
    harness.store.state.tokens[0]!.x = 99;
    harness.store.state.chat[0]!.body = "Uncommitted duplicate-version batch";
    harness.store.state.systemInstallations.push(conflictingUnboundInstallation());
    harness.store.save();
    validationFailure(() => harness.store.flush());
    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
  });

  it.each(nonJsonRecordFailures())("rejects $name and discards the entire pending batch", ({ edit, collection, recordId }) => {
    const harness = createHarness(kind);
    harness.store.state.tokens[0]!.x = 17;
    harness.store.state.chat[0]!.body = "Previously accepted batch";
    harness.store.save();
    harness.store.flush();
    const accepted = structuredClone(harness.store.state);

    harness.store.state.tokens[0]!.x = 99;
    harness.store.state.chat[0]!.body = "Pending non-JSON batch";
    edit(harness.store.state);
    expect(() => harness.store.save()).not.toThrow();
    const error = validationFailure(() => harness.store.flush());
    expect(error.issues).toContainEqual(expect.objectContaining({ collection, recordId }));
    expect(harness.store.state).toEqual(accepted);
    expect(Object.hasOwn(harness.store.state[collection][0]!.data, "invalid")).toBe(false);

    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
    harness.store.state.campaigns[0]!.eventSequence = 21;
    harness.store.save();
    harness.store.flush();
    expect(harness.store.state[collection]).toEqual(accepted[collection]);
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it.each(malformedDefinitionMarkers())("discards an own $name executable marker added to metadata-only installation data", ({ value }) => {
    const harness = createHarness(kind, legacyMetadataState());
    const accepted = structuredClone(harness.store.state);
    (harness.store.state.systemInstallations[0]!.manifest as unknown as { definition: unknown }).definition = value;
    expect(() => harness.store.save()).not.toThrow();
    validationFailure(() => harness.store.flush());
    expect(harness.store.state).toEqual(accepted);
    expect(Object.hasOwn(harness.store.state.systemInstallations[0]!.manifest, "definition")).toBe(false);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
  });

  it("discards null bindings on a campaign without any declarative records", () => {
    const state = legacyMetadataState();
    state.campaigns.push({ ...campaign("camp_legacy", lanternManifest()), defaultSystemId: "legacy-metadata", systemBindings: undefined });
    const harness = createHarness(kind, state);
    const accepted = structuredClone(harness.store.state);
    (harness.store.state.campaigns[0] as unknown as { systemBindings: unknown }).systemBindings = null;
    expect(() => harness.store.save()).not.toThrow();
    validationFailure(() => harness.store.flush());
    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
  });

  it.each(recordFailures())("rolls back $name with unchanged timestamps and leaves durable state unchanged", ({ edit }) => {
    const harness = createHarness(kind, fixtureState(nestedManifest()));
    const accepted = structuredClone(harness.store.state);
    edit(harness.store.state);
    expect(harness.store.state.actors[0]!.updatedAt).toBe(accepted.actors[0]!.updatedAt);
    expect(() => harness.store.save()).not.toThrow();
    validationFailure(() => harness.store.flush());
    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expect(harness.store.state).toEqual(accepted);
    expectReopened(harness, accepted);
  });

  it("keeps save and deferred replacement pending and restores the complete preceding accepted batch", () => {
    const harness = createHarness(kind);
    harness.store.state.tokens[0]!.x = 17;
    harness.store.state.chat[0]!.body = "Previously committed chat";
    harness.store.state.actors[0]!.data.stamina = 5;
    harness.store.save();
    harness.store.flush();
    const accepted = structuredClone(harness.store.state);

    harness.store.state.tokens[0]!.x = 91;
    harness.store.state.chat[0]!.body = "Pending chat";
    harness.store.state.actors[0]!.data.wits = 3;
    expect(() => harness.store.save()).not.toThrow();
    const candidate = structuredClone(harness.store.state);
    candidate.actors[0]!.data.stamina = -1;
    candidate.items[0]!.name = "Pending item";
    expect(() => harness.store.replace(candidate, { flush: false })).not.toThrow();
    expect(harness.store.state.tokens[0]!.x).toBe(91);
    expect(harness.store.state.actors[0]!.data.stamina).toBe(-1);
    validationFailure(() => harness.store.flush());

    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(70)).not.toThrow();
    expectReopened(harness, accepted);
  });

  it("rejects invalid default replacement atomically", () => {
    const harness = createHarness(kind);
    const accepted = structuredClone(harness.store.state);
    const candidate = structuredClone(accepted);
    candidate.campaigns[0]!.name = "Uncommitted campaign";
    candidate.actors = [{ ...candidate.actors[0]!, data: { wits: 2 } }];
    validationFailure(() => harness.store.replace(candidate));
    expect(harness.store.state).toEqual(accepted);
    expectReopened(harness, accepted);
  });

  it("rejects same-version definition tampering and cannot later flush the rejected pin", () => {
    const harness = createHarness(kind);
    const accepted = structuredClone(harness.store.state);
    const candidate = structuredClone(accepted);
    const definition = candidate.systemInstallations[0]!.manifest as DeclarativeSystemManifest;
    definition.name = "Tampered version";
    candidate.systemInstallations[0]!.checksum = declarativeSystemManifestChecksum(definition);
    candidate.campaigns[0]!.systemBindings = [identity(definition)];
    validationFailure(() => harness.store.replace(candidate));
    expect(harness.store.state).toEqual(accepted);
    harness.store.flush();
    expectReopened(harness, accepted);
  });

  it("does zero schema work for movement, chat and cursor changes, one actor for an actor edit, and zero for an unrelated version", () => {
    const harness = createHarness(kind);
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    harness.store.state.tokens[0]!.x = 23;
    harness.store.state.chat[0]!.body = "New chat";
    harness.store.state.campaigns[0]!.eventSequence = 11;
    harness.store.save();
    harness.store.flush();
    expect(validate).not.toHaveBeenCalled();

    harness.store.state.actors[0]!.name = "One changed actor";
    harness.store.save();
    harness.store.flush();
    expect(validate).toHaveBeenCalledTimes(1);
    validate.mockClear();
    harness.store.state.systemInstallations.push(installation(lanternManifest("2.0.0")));
    harness.store.save();
    harness.store.flush();
    expect(validate).not.toHaveBeenCalled();
  });

  it("accepts a runtime cost candidate and retains the cost after reopening", () => {
    const harness = createHarness(kind);
    const currentActor = structuredClone(harness.store.state.actors[0]!);
    const resolved = resolvePinnedDeclarativeSystem(harness.store.state, currentActor.campaignId, currentActor.systemId);
    const runtime = createDeclarativeSystemRuntime(resolved.manifest, { campaignId: currentActor.campaignId, ...resolved.identity }, { coreVersion: "0.3.0" });
    const plan = runtime.prepareAction(currentActor, { rollId: "push", expectedActorUpdatedAt: currentActor.updatedAt, expectedSystem: resolved.identity });
    expect(plan.cost).toMatchObject({ before: 6, after: 5, amount: 1 });
    expect(currentActor.data.stamina).toBe(6);
    const candidate = structuredClone(harness.store.state);
    candidate.actors[0]!.data = plan.actorData;
    assertDeclarativeSystemStateCandidate(harness.store.state, candidate);
    harness.store.replace(candidate);
    expect(harness.store.state.actors[0]!.data.stamina).toBe(5);
    expectReopened(harness, structuredClone(harness.store.state));
  });
});

describe("SQLite candidates retaining accepted actor and item objects", () => {
  it("preflights and persists a compatible pin switch without treating retained tracking accessors as user data", () => {
    const harness = createHarness("sqlite");
    const previous = harness.store.state;
    const accepted = structuredClone(previous);
    expect(Object.getOwnPropertyDescriptor(previous.actors[0]!.data, "wits")?.get).toBeTypeOf("function");
    expect(Object.getOwnPropertyDescriptor(previous.items[0]!.data, "quality")?.get).toBeTypeOf("function");
    const next = lanternManifest("2.0.0");
    const nextIdentity = identity(next);
    const candidate = sharedRecordPinCandidate(previous, next);
    expect(candidate.actors).toBe(previous.actors);
    expect(candidate.items).toBe(previous.items);
    expect(candidate.campaigns[0]).not.toBe(previous.campaigns[0]);
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");

    expect(() => assertDeclarativeSystemStateCandidate(previous, candidate)).not.toThrow();
    expect(validate).toHaveBeenCalledTimes(2);
    expect(previous).toEqual(accepted);
    validate.mockClear();
    expect(() => harness.store.replace(candidate)).not.toThrow();
    expect(validate).toHaveBeenCalledTimes(2);
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([nextIdentity]);
    expect(harness.store.state.actors).toEqual(accepted.actors);
    expect(harness.store.state.items).toEqual(accepted.items);
    expectReopened(harness, structuredClone(harness.store.state));
  });

  it.each(["actors", "items"] as const)("rejects an incompatible %s schema for retained records and preserves the accepted state", (collection) => {
    const harness = createHarness("sqlite");
    const previous = harness.store.state;
    const accepted = structuredClone(previous);
    const next = lanternManifest("2.0.0");
    if (collection === "actors") {
      next.schemas.actor.properties.wits = { type: "integer", minimum: 0, maximum: 1 };
      next.definition.actorDefaults.wits = 1;
    } else {
      next.schemas.item.properties.quality = { type: "string", maxLength: 16, enum: ["refined"] };
      next.definition.itemDefaults.quality = "refined";
    }
    const candidate = sharedRecordPinCandidate(previous, next);
    const error = validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    expect(error.issues).toContainEqual(expect.objectContaining({ collection, recordId: previous[collection][0]!.id }));
    expect(previous).toEqual(accepted);
    validationFailure(() => harness.store.replace(candidate));
    expect(harness.store.state).toEqual(accepted);
    expect(() => harness.store.flush()).not.toThrow();
    expectReopened(harness, accepted);
  });

  it.each(["actors", "items"] as const)("rejects newly supplied %s accessor data even when its values equal the previous tracked record", (collection) => {
    const harness = createHarness("sqlite");
    const previous = harness.store.state;
    const accepted = structuredClone(previous);
    const candidate = sharedRecordPinCandidate(previous, lanternManifest("2.0.0"));
    if (collection === "actors") {
      const supplied = structuredClone(previous.actors[0]!);
      const wits = supplied.data.wits;
      Object.defineProperty(supplied.data, "wits", { enumerable: true, configurable: true, get: () => wits });
      candidate.actors = [supplied];
      expect(candidate.actors[0]).not.toBe(previous.actors[0]);
      expect(candidate.actors[0]).toEqual(previous.actors[0]);
    } else {
      const supplied = structuredClone(previous.items[0]!);
      const quality = supplied.data.quality;
      Object.defineProperty(supplied.data, "quality", { enumerable: true, configurable: true, get: () => quality });
      candidate.items = [supplied];
      expect(candidate.items[0]).not.toBe(previous.items[0]);
      expect(candidate.items[0]).toEqual(previous.items[0]);
    }
    const error = validationFailure(() => assertDeclarativeSystemStateCandidate(previous, candidate));
    expect(error.issues).toContainEqual(expect.objectContaining({ collection, recordId: previous[collection][0]!.id, code: "json_property" }));
    expect(previous).toEqual(accepted);
    expectReopened(harness, accepted);
  });

  it("does no actor/item schema work for a cursor-only candidate sharing accepted record arrays", () => {
    const harness = createHarness("sqlite");
    const previous = harness.store.state;
    const candidate: EngineState = {
      ...previous,
      campaigns: previous.campaigns.map((entry) => ({ ...structuredClone(entry), eventSequence: 23 })),
    };
    expect(candidate.actors).toBe(previous.actors);
    expect(candidate.items).toBe(previous.items);
    const validate = vi.spyOn(systemSdk, "validateDeclarativeSystemData");
    assertDeclarativeSystemStateCandidate(previous, candidate);
    harness.store.replace(candidate);
    expect(validate).not.toHaveBeenCalled();
    expectReopened(harness, structuredClone(harness.store.state));
  });
});

it("SQLite reuses persistence bytes and does not serialize untouched actors during movement or a single actor edit", () => {
  const state = fixtureState();
  state.actors.push(actor("actor_untouched", "camp_lantern", lanternManifest()));
  const harness = createHarness("sqlite", state);
  const store = harness.store as SqliteStateStore;
  const changedActor = store.state.actors[0]!;
  const untouchedActor = store.state.actors[1]!;
  const stringify = vi.spyOn(JSON, "stringify");
  const prepare = vi.spyOn(store.db, "prepare");
  store.state.tokens[0]!.x = 40;
  store.save();
  store.flush();
  expect(stringify.mock.calls.filter(([value]) => value === changedActor || value === untouchedActor)).toHaveLength(0);
  stringify.mockClear();
  changedActor.data.wits = 3;
  store.save();
  store.flush();
  expect(stringify.mock.calls.filter(([value]) => value === changedActor)).toHaveLength(1);
  expect(stringify.mock.calls.filter(([value]) => value === untouchedActor)).toHaveLength(0);
  expect(prepare.mock.calls.map(([sql]) => sql.toLowerCase()).filter((sql) => sql.trimStart().startsWith("select") && sql.includes("engine_records"))).toEqual([]);
});

function identityFailures(): Array<{ name: string; edit: (state: EngineState) => void }> { return [
  { name: "a missing campaign binding", edit: (state) => { state.campaigns[0]!.systemBindings = undefined; } },
  { name: "duplicate campaign bindings", edit: (state) => { state.campaigns[0]!.systemBindings!.push({ ...state.campaigns[0]!.systemBindings![0]! }); } },
  { name: "a missing installed definition", edit: (state) => { state.systemInstallations = []; } },
  { name: "duplicate installed system versions", edit: (state) => { state.systemInstallations.push({ ...structuredClone(state.systemInstallations[0]!), id: "duplicate_installation" }); } },
  { name: "a missing executable installation checksum", edit: (state) => { delete state.systemInstallations[0]!.checksum; } },
  { name: "a stored checksum mismatch", edit: (state) => { state.systemInstallations[0]!.checksum = "0".repeat(64); } },
  { name: "a binding checksum mismatch", edit: (state) => { state.campaigns[0]!.systemBindings![0]!.checksum = "0".repeat(64); } },
  { name: "a computed manifest checksum mismatch", edit: (state) => { state.systemInstallations[0]!.manifest.name = "Unhashed change"; } },
  { name: "a missing pinned version", edit: (state) => { state.campaigns[0]!.systemBindings![0]!.version = "9.0.0"; } },
  { name: "an unknown definition kind", edit: (state) => { (state.systemInstallations[0]!.manifest as unknown as { definition: { kind: string } }).definition.kind = "future-executable"; } },
  { name: "a malformed executable marker", edit: (state) => { (state.systemInstallations[0]!.manifest as unknown as { definition: unknown }).definition = null; } },
]; }

function recordFailures(): Array<{ name: string; collection: "actors" | "items"; recordId: string; edit: (state: EngineState) => void }> { return [
  { name: "nested actor data edits", collection: "actors", recordId: "actor_surveyor", edit: (state) => { (state.actors[0]!.data.supplies as Record<string, unknown>).light = -1; } },
  { name: "new undeclared actor data keys", collection: "actors", recordId: "actor_surveyor", edit: (state) => { state.actors[0]!.data.undeclared = true; } },
  { name: "deleted required actor data keys", collection: "actors", recordId: "actor_surveyor", edit: (state) => { delete state.actors[0]!.data.stamina; } },
  { name: "invalid actor scalar data", collection: "actors", recordId: "actor_surveyor", edit: (state) => { state.actors[0]!.data.wits = 5; } },
  { name: "an undeclared actor type", collection: "actors", recordId: "actor_surveyor", edit: (state) => { state.actors[0]!.type = "wizard"; } },
  { name: "a replaced actor record with invalid data", collection: "actors", recordId: "actor_surveyor", edit: (state) => { state.actors = [{ ...state.actors[0]!, data: {} }]; } },
  { name: "invalid item data", collection: "items", recordId: "item_lantern", edit: (state) => { state.items[0]!.data.quality = "invalid-quality"; } },
  { name: "an undeclared item type", collection: "items", recordId: "item_lantern", edit: (state) => { state.items[0]!.type = "spell"; } },
]; }

function defaultTransitions(): Array<{ name: string; previous: () => EngineState; edit: (state: EngineState) => void; invalidInitial: boolean }> {
  return [
    {
      name: "inserting a campaign with an executable default and no pin",
      previous: () => { const state = emptyState(); state.systemInstallations = [installation(lanternManifest())]; return state; },
      edit: (state) => { state.campaigns.push({ ...campaign("camp_lantern", lanternManifest()), systemBindings: undefined }); },
      invalidInitial: true,
    },
    {
      name: "changing a historical default to an installed executable without a pin",
      previous: () => { const state = legacyDefaultState("historical-unknown"); state.systemInstallations = [installation(lanternManifest())]; return state; },
      edit: (state) => { state.campaigns[0]!.defaultSystemId = "lantern-survey"; },
      invalidInitial: true,
    },
    {
      name: "installing the first executable definition for an unbound historical default",
      previous: () => legacyDefaultState("lantern-survey"),
      edit: (state) => { state.systemInstallations.push(installation(lanternManifest())); },
      invalidInitial: true,
    },
    {
      name: "removing the executable definition and pin while retaining its default",
      previous: emptyCampaignState,
      edit: (state) => { state.systemInstallations = []; state.campaigns[0]!.systemBindings = undefined; },
      invalidInitial: false,
    },
    {
      name: "removing the definition while retaining its exact binding",
      previous: emptyCampaignState,
      edit: (state) => { state.systemInstallations = []; },
      invalidInitial: true,
    },
  ];
}

function malformedDefinitionMarkers(): Array<{ name: string; value: unknown }> {
  return [{ name: "undefined", value: undefined }, { name: "function", value: () => ({ kind: "declarative-v1" }) }];
}

function nonJsonRecordFailures(): Array<{ name: string; collection: "actors" | "items"; recordId: string; edit: (state: EngineState) => void }> {
  const edits: Array<{ name: string; apply: (data: Record<string, unknown>) => void }> = [
    { name: "BigInt data", apply: (data) => { data.invalid = 1n; } },
    { name: "cyclic data", apply: (data) => { data.invalid = data; } },
    { name: "an own undefined data property", apply: (data) => { data.invalid = undefined; } },
    { name: "an own function data property", apply: (data) => { data.invalid = () => 1; } },
  ];
  return (["actors", "items"] as const).flatMap((collection) => edits.map(({ name, apply }) => ({
    name: collection + ": " + name,
    collection,
    recordId: collection === "actors" ? "actor_surveyor" : "item_lantern",
    edit: (state: EngineState) => apply(state[collection][0]!.data),
  })));
}

function lanternManifest(version = "1.0.0"): DeclarativeSystemManifest {
  return {
    id: "lantern-survey", name: "Lantern Survey", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: {
        type: "object", additionalProperties: false, required: ["wits", "grit", "stamina"],
        properties: {
          wits: { type: "integer", minimum: 0, maximum: 4 },
          grit: { type: "integer", minimum: 0, maximum: 4 },
          stamina: { type: "integer", minimum: 0, maximum: 6 },
        },
      },
      item: {
        type: "object", additionalProperties: false, required: ["weight", "quality"],
        properties: {
          weight: { type: "integer", minimum: 0, maximum: 20 },
          quality: { type: "string", enum: ["basic", "refined"], maxLength: 16 },
        },
      },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions"],
    definition: {
      kind: "declarative-v1", actorTypes: ["surveyor"], itemTypes: ["gear"],
      actorDefaults: { wits: 2, grit: 1, stamina: 6 }, itemDefaults: { weight: 1, quality: "basic" },
      sheet: { fields: [
        { path: ["wits"], label: "Wits", editable: true },
        { path: ["grit"], label: "Grit", editable: true },
        { path: ["stamina"], label: "Stamina", editable: true },
      ] },
      quickRolls: [
        { id: "survey", label: "Survey", dice: { count: 2, sides: 6, bonus: 0, addFields: [["wits"]] } },
        { id: "push", label: "Push forward", dice: { count: 2, sides: 6, bonus: 0, addFields: [["grit"]] }, cost: { path: ["stamina"], amount: 1 } },
      ],
    },
  };
}

function nestedManifest(): DeclarativeSystemManifest {
  const definition = lanternManifest();
  definition.schemas.actor.properties.supplies = {
    type: "object", additionalProperties: false, required: ["light"],
    properties: { light: { type: "integer", minimum: 0, maximum: 4 } },
  };
  definition.definition.actorDefaults.supplies = { light: 2 };
  return definition;
}

function identity(definition: DeclarativeSystemManifest): SystemManifestIdentity {
  return { systemId: definition.id, version: definition.version, checksum: declarativeSystemManifestChecksum(definition) };
}

function installation(definition: DeclarativeSystemManifest, id = `install_${definition.id}_${definition.version}`): SystemInstallation {
  return { id, manifest: definition, checksum: declarativeSystemManifestChecksum(definition), installedByUserId: "usr_test", authorizedByCampaignId: "camp_lantern", source: "api", createdAt: timestamp, updatedAt: timestamp };
}

function campaign(id: string, definition: DeclarativeSystemManifest): Campaign {
  return { id, ownerUserId: "usr_test", name: id, description: "", defaultSystemId: definition.id, systemBindings: [identity(definition)], visibility: "private", createdAt: timestamp, updatedAt: timestamp };
}

function actor(id: string, campaignId: string, definition: DeclarativeSystemManifest): Actor {
  return { id, campaignId, systemId: definition.id, ownerUserId: "usr_test", type: "surveyor", name: id, data: structuredClone(definition.definition.actorDefaults), permissions: {}, createdAt: timestamp, updatedAt: timestamp };
}

function item(id: string, campaignId: string, definition: DeclarativeSystemManifest): Item {
  return { id, campaignId, systemId: definition.id, type: "gear", name: id, data: structuredClone(definition.definition.itemDefaults), createdAt: timestamp, updatedAt: timestamp };
}

function fixtureState(definition = lanternManifest()): EngineState {
  const state = emptyState();
  state.campaigns = [campaign("camp_lantern", definition)];
  state.systemInstallations = [installation(definition)];
  state.actors = [actor("actor_surveyor", "camp_lantern", definition)];
  state.items = [item("item_lantern", "camp_lantern", definition)];
  state.tokens = [{ id: "token_surveyor", sceneId: "scene_lantern", actorId: "actor_surveyor", name: "Surveyor", x: 0, y: 0, width: 1, height: 1, rotation: 0, hidden: false, locked: false, visionEnabled: true, visionRadius: 6, disposition: "friendly", metadata: {}, createdAt: timestamp, updatedAt: timestamp }];
  state.chat = [{ id: "chat_lantern", campaignId: "camp_lantern", userId: "usr_test", type: "plain", body: "Accepted chat", visibility: "public", recipientUserIds: [], createdAt: timestamp, updatedAt: timestamp }];
  return state;
}

function sharedRecordPinCandidate(previous: EngineState, definition: DeclarativeSystemManifest): EngineState {
  return {
    ...previous,
    campaigns: previous.campaigns.map((entry) => ({ ...structuredClone(entry), systemBindings: [identity(definition)] })),
    systemInstallations: [...previous.systemInstallations, installation(definition)],
  };
}

function emptyCampaignState(): EngineState {
  const state = emptyState();
  const definition = lanternManifest();
  state.campaigns = [campaign("camp_lantern", definition)];
  state.systemInstallations = [installation(definition)];
  return state;
}

function legacyDefaultState(systemId: string): EngineState {
  const state = emptyState();
  state.campaigns = [{ ...campaign("camp_lantern", lanternManifest()), defaultSystemId: systemId, systemBindings: undefined }];
  return state;
}

function legacyMetadataState(): EngineState {
  const state = emptyState();
  state.systemInstallations = [{
    id: "legacy_installation",
    manifest: {
      id: "legacy-metadata", name: "Historical metadata", version: "1.0.0", compatibleCore: "*",
      entrypoints: {}, schemas: { actor: "legacy.actor.json", item: "legacy.item.json" }, permissions: [], capabilities: [],
    },
    installedByUserId: "usr_test", authorizedByCampaignId: "camp_legacy", source: "api", createdAt: timestamp, updatedAt: timestamp,
  }];
  return state;
}

function stateWithUnboundVersion(): EngineState {
  const state = fixtureState(lanternManifest("2.0.0"));
  state.systemInstallations.unshift(installation(lanternManifest()));
  return state;
}

function conflictingUnboundInstallation(): SystemInstallation {
  const definition = lanternManifest();
  definition.name = "Conflicting content for an unbound version";
  return installation(definition, "conflicting_unbound_installation");
}

function validationFailure(action: () => unknown): DeclarativeSystemStateError {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DeclarativeSystemStateError);
  if (!(caught instanceof DeclarativeSystemStateError)) throw new Error("Expected structured declarative state rejection");
  expect(caught.statusCode).toBe(422);
  expect(caught.issues.length).toBeGreaterThan(0);
  expect(caught.issues.length).toBeLessThanOrEqual(32);
  return caught;
}

function changesBetween(previous: DeclarativeSystemState, candidate: DeclarativeSystemState): DeclarativeStateRecordChange[] {
  const changes: DeclarativeStateRecordChange[] = [];
  for (const collection of ["campaigns", "actors", "items", "systemInstallations"] as const) {
    const before = new Map(previous[collection].map((record) => [record.id, JSON.stringify(record)]));
    const after = new Map(candidate[collection].map((record) => [record.id, JSON.stringify(record)]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(id) !== after.get(id)) changes.push({ collection, id, beforeJson: before.get(id), afterJson: after.get(id) });
    }
  }
  return changes;
}

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "otte-declarative-state-"));
  directories.push(directory);
  return directory;
}

function track<T extends TestStore>(store: T): T {
  stores.add(store);
  return store;
}

function closeTracked(store: TestStore): void {
  stores.delete(store);
  if ("close" in store) store.close();
}

interface StoreHarness {
  store: TestStore;
  reopen?: () => TestStore;
}

function createHarness(kind: StoreKind, state = fixtureState()): StoreHarness {
  if (kind === "memory") return { store: track(new MemoryStateStore(state)) };
  const path = join(tempDirectory(), kind === "file" ? "state.json" : "state.sqlite");
  if (kind === "file") {
    writeFileSync(path, JSON.stringify(state));
    return { store: track(new FileStateStore(path, { seedDemo: false })), reopen: () => track(new FileStateStore(path, { seedDemo: false })) };
  }
  const store = track(new SqliteStateStore(path, { seedDemo: false }));
  store.replace(state);
  return { store, reopen: () => track(new SqliteStateStore(path, { seedDemo: false })) };
}

function expectReopened(harness: StoreHarness, accepted: EngineState): void {
  if (!harness.reopen) return;
  const reopened = harness.reopen();
  expect(reopened.state).toEqual(accepted);
  closeTracked(reopened);
}
