import type { DndControlledCreatureActionHandoff, DndControlledCreatureRecord } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ControlledCreaturesPanel,
  controlledCreatureDurationLabel,
  controlledCreaturesPath,
  emptyControlledCreatureRevisions,
  handoffFieldLocked,
  lifecycleDraftFromHandoff,
  mergeControlledCreatureRevisions,
} from "./controlled-creatures-panel.js";
import { clearControlledCreatureHandoff, controlledCreatureHandoffLifetimeMs, controlledCreatureHandoffStorageKey, loadControlledCreatureHandoff, saveControlledCreatureHandoff } from "./controlled-creature-handoff-state.js";

const baseRecord = {
  version: 1,
  id: "ccr",
  campaignId: "camp",
  kind: "summon",
  status: "active",
  source: { kind: "spell", actorId: "source", itemId: "spell", name: "Summon", systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1" },
  controllerUserId: "user",
  controllerActorId: "source",
  ownerUserId: "user",
  linkedActorId: "summon",
  linkedTokenIds: [],
  duration: { mode: "until_dismissed" },
  initiative: { mode: "independent" },
  command: { required: true, action: "bonus_action" },
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
} satisfies DndControlledCreatureRecord;

const preparedHandoff = {
  version: 1,
  status: "supported",
  action: { actorId: "druid", rollId: "feature-wild-shape", label: "Wild Shape", preparedPreviewKey: "prepared-1", resolutionHash: "hash-1" },
  prefill: {
    kind: "transformation",
    source: { kind: "feature", actorId: "druid", name: "Wild Shape", systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1" },
    originatingAction: { actorId: "druid", rollId: "feature-wild-shape", label: "Wild Shape", preparedPreviewKey: "prepared-1", resolutionHash: "hash-1" },
    controllerActorId: "druid",
    targetActorId: "druid",
    actor: { name: "Wolf", type: "beast", data: { hp: { current: 11, max: 11 }, temporaryHitPoints: 5, rulesVersion: "SRD 5.2.1", compendiumProvenance: { entryId: "wolf" } } },
    duration: { mode: "until_time", expiresAt: "2026-07-13T13:00:00.000Z" },
    concentration: { sourceActorId: "druid", groupId: "prepared-1" },
    initiative: { mode: "shared", sourceActorId: "druid" },
    command: { required: false, action: "none" },
    transformation: { hpCarryover: "preserve", equipmentCarryover: "suppress" },
  },
  sourcedFields: ["source", "actor.data.compendiumProvenance", "duration", "concentration", "initiative", "command"],
  manualChoices: [{ field: "transformation.form", reason: "Choose an eligible Beast form." }],
} satisfies DndControlledCreatureActionHandoff;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    raw: values,
  };
}

describe("ControlledCreaturesPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders an accessible reviewed lifecycle entry point without raw JSON controls", () => {
    const html = renderToStaticMarkup(
      <ControlledCreaturesPanel campaignId="campaign/demo" currentUserId="user" actors={[]} items={[]} scenes={[]} combats={[]} canPrepare onChanged={() => undefined} onStatus={() => undefined} />,
    );
    expect(html).toContain("Summons, transformations, and companions");
    expect(html).toContain("Preview explicit duration");
    expect(html).toContain("Loading controlled creatures...");
    expect(html).toContain('role="status"');
    expect(html).toContain("Confirm reviewed lifecycle");

    const source = readFileSync(resolve(__dirname, "controlled-creatures-panel.tsx"), "utf8");
    expect(source).toContain("I reviewed these ambiguities with the DM.");
    expect(source).toContain("End concentration");
    expect(source).toContain("Reloaded current records; review and try again.");
    expect(source).not.toContain("Reviewed stat block JSON");
    expect(source).not.toContain("JSON.parse");
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("console.");

    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain("if (prepared.controlledCreatureHandoff) return { handoff: prepared.controlledCreatureHandoff };");
    expect(appSource).toContain("handoff={controlledCreatureHandoff}");
    expect(appSource).toContain("onHandoffConsumed={() => setControlledCreatureHandoff(undefined)}");
    expect(appSource).toContain("function closeWorkspaceDialogs() {\n    setCharacterCreatorOpen(false);\n    setControlledCreatureHandoff(undefined);");
    expect(appSource.indexOf("if (prepared.controlledCreatureHandoff)")).toBeLessThan(appSource.indexOf("consequenceReview.review(actorActionConsequenceReview"));
    expect(source).toContain('consumeHandoff("confirmed")');
    expect(source).toContain('consumeHandoff("cancelled")');
  });

  it("prefills typed lifecycle fields while retaining source stat data internally", () => {
    const draft = lifecycleDraftFromHandoff(preparedHandoff);
    expect(draft).toMatchObject({
      kind: "transformation",
      sourceActorId: "druid",
      targetActorId: "druid",
      name: "Wolf",
      actorType: "beast",
      hpCurrent: 11,
      hpMax: 11,
      durationMode: "until_time",
      expiresAt: "2026-07-13T13:00",
      concentrationGroupId: "prepared-1",
      initiativeMode: "shared",
      commandRequired: false,
      commandAction: "none",
      hpCarryover: "preserve",
      equipmentCarryover: "suppress",
      actorData: { temporaryHitPoints: 5, compendiumProvenance: { entryId: "wolf" } },
    });
    expect(handoffFieldLocked(preparedHandoff, "duration")).toBe(true);
    expect(handoffFieldLocked(preparedHandoff, "transformation.form")).toBe(false);
  });

  it("restores the usable handoff and reviewed draft after a reload, then removes both when consumed", () => {
    const storage = memoryStorage();
    const scope = { campaignId: "campaign/demo", userId: "user" };
    const reviewedDraft = { ...lifecycleDraftFromHandoff(preparedHandoff), name: "Reviewed Dire Wolf", hpCurrent: 9 };
    saveControlledCreatureHandoff(storage, scope, preparedHandoff, { ...reviewedDraft, previewToken: "must-not-persist" } as typeof reviewedDraft);
    vi.stubGlobal("window", { sessionStorage: storage });

    const restored = renderToStaticMarkup(
      <ControlledCreaturesPanel campaignId={scope.campaignId} currentUserId={scope.userId} actors={[]} items={[]} scenes={[]} combats={[]} canPrepare onChanged={() => undefined} onStatus={() => undefined} />,
    );
    expect(restored).toContain("Prepared from Wild Shape");
    expect(restored).toContain('value="Reviewed Dire Wolf"');
    expect(restored).toContain('value="9"');
    expect(restored).toContain("Cancel prepared action");
    expect(restored).not.toContain("Ready to confirm");
    expect(storage.raw.get(controlledCreatureHandoffStorageKey(scope))).not.toContain("must-not-persist");

    clearControlledCreatureHandoff(storage, scope);
    const afterConsumption = renderToStaticMarkup(
      <ControlledCreaturesPanel campaignId={scope.campaignId} currentUserId={scope.userId} actors={[]} items={[]} scenes={[]} combats={[]} canPrepare onChanged={() => undefined} onStatus={() => undefined} />,
    );
    expect(afterConsumption).not.toContain("Prepared from Wild Shape");
    expect(afterConsumption).not.toContain("Reviewed Dire Wolf");
    expect(afterConsumption).not.toContain("Cancel prepared action");
  });

  it("rejects expired, corrupt, and cross-scope handoffs and lets a different incoming action replace stale UI state", () => {
    const storage = memoryStorage();
    const scope = { campaignId: "campaign/demo", userId: "user" };
    const draft = lifecycleDraftFromHandoff(preparedHandoff);
    saveControlledCreatureHandoff(storage, scope, preparedHandoff, draft, 1_000);
    expect(loadControlledCreatureHandoff(storage, scope, 1_000 + controlledCreatureHandoffLifetimeMs)).toBeUndefined();
    expect(storage.raw.has(controlledCreatureHandoffStorageKey(scope))).toBe(false);

    saveControlledCreatureHandoff(storage, scope, preparedHandoff, draft, Date.now());
    expect(loadControlledCreatureHandoff(storage, { ...scope, userId: "other" })).toBeUndefined();
    storage.setItem(controlledCreatureHandoffStorageKey(scope), "not-json");
    expect(loadControlledCreatureHandoff(storage, scope)).toBeUndefined();

    saveControlledCreatureHandoff(storage, scope, preparedHandoff, { ...draft, name: "Stale Wolf" });
    vi.stubGlobal("window", { sessionStorage: storage });
    const incoming = {
      ...preparedHandoff,
      action: { ...preparedHandoff.action, label: "Polymorph", preparedPreviewKey: "prepared-2", resolutionHash: "hash-2" },
      prefill: {
        ...preparedHandoff.prefill,
        originatingAction: { ...preparedHandoff.prefill.originatingAction, label: "Polymorph", preparedPreviewKey: "prepared-2", resolutionHash: "hash-2" },
        actor: { ...preparedHandoff.prefill.actor, name: "Giant Ape" },
      },
    } satisfies DndControlledCreatureActionHandoff;
    const replaced = renderToStaticMarkup(
      <ControlledCreaturesPanel campaignId={scope.campaignId} currentUserId={scope.userId} actors={[]} items={[]} scenes={[]} combats={[]} canPrepare handoff={incoming} onChanged={() => undefined} onStatus={() => undefined} />,
    );
    expect(replaced).toContain("Prepared from Polymorph");
    expect(replaced).toContain('value="Giant Ape"');
    expect(replaced).not.toContain("Stale Wolf");
  });

  it("encodes paths and composes complete optimistic-revision roots", () => {
    expect(controlledCreaturesPath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/systems/dnd-5e-srd/controlled-creatures");
    const first = emptyControlledCreatureRevisions();
    first.actors.actor = "a1";
    const second = emptyControlledCreatureRevisions();
    second.items.item = "i1";
    expect(mergeControlledCreatureRevisions(first, second)).toEqual({ actors: { actor: "a1" }, items: { item: "i1" }, tokens: {}, combats: {}, scenes: {}, encounters: {} });
  });

  it("presents each durable duration mode clearly", () => {
    expect(controlledCreatureDurationLabel(baseRecord)).toBe("until dismissed");
    expect(controlledCreatureDurationLabel({ ...baseRecord, duration: { mode: "rounds", combatId: "combat", expiresAtRound: 4 } })).toBe("through round 4");
    expect(controlledCreatureDurationLabel({ ...baseRecord, kind: "persistent_companion", duration: { mode: "persistent" } })).toBe("persistent companion");
  });
});
