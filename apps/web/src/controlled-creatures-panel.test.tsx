import type { DndControlledCreatureRecord } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ControlledCreaturesPanel,
  controlledCreatureDurationLabel,
  controlledCreaturesPath,
  emptyControlledCreatureRevisions,
  mergeControlledCreatureRevisions,
} from "./controlled-creatures-panel.js";

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

describe("ControlledCreaturesPanel", () => {
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
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("console.");
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
